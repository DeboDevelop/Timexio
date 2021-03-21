const express = require("express");
const bcryptjs = require("bcryptjs");
const passport = require("passport");
const axios = require("axios");
const User = require("../models/User");
const { forwardAuthenticated } = require("../config/auth");
const { getCommonMetaData } = require("./utils");
const settings = require("../settings");
const { Mail } = require("./utils");

const router = express.Router();

// Register Page
router.get("/signup", forwardAuthenticated, (req, res) => {
    res.render("signup", {
        ...getCommonMetaData(req, "Sign Up"),
    });
});
router.post("/signup", async (req, res) => {
    let errors = [];
    const { name, email, password, password2, admin, nextPage } = req.body;
    const oldUser = await User.findOne({ email });
    if (oldUser) {
        errors.push({ msg: "This email is already registered!" });
    }
    if (!name || !email || !password || !password2) {
        errors.push({ msg: "Please fill up all the fields!" });
    }
    if (password.length < 6) {
        errors.push({ msg: "Password must have at least 6 characters" });
    }
    if (password !== password2) {
        errors.push({ msg: "Passwords didn't matched" });
    }
    if (errors.length > 0) {
        if (req.isAuthenticated()) {
            req.flash("error_msg_list", errors);
            return res.redirect("back");
        }

        res.render("signup", {
            ...getCommonMetaData(req, "Sign Up"),
            errors,
            name,
            email,
            password,
            password2,
        });
    }

    // all Validations passed!
    else {
        let newUser;

        // give admin permissions while creating users from admin panel
        if (admin == "true") {
            newUser = new User({
                name,
                email,
                password,
                admin: true,
            });
        }
        // creates user from sign up page
        else {
            newUser = new User({
                name,
                email,
                password,
            });
        }
        // hash password
        bcryptjs.genSalt(10, (genSaltError, salt) => {
            if (genSaltError) {
                console.log(genSaltError);
                throw genSaltError;
            }
            bcryptjs.hash(newUser.password, salt, (hashError, hash) => {
                if (hashError) {
                    console.log(hashError);
                    throw hashError;
                }
                // set password to hash
                newUser.password = hash;
                // save the user
                newUser
                    .save()
                    .then(user => {
                        req.flash("success_msg", "Registration successful! New account has been created.");
                        // send the mail
                        const newMail = new Mail();
                        const id = user._id;
                        console.log("id", id);
                        newMail
                            .signupSuccessful({ name, email, id })
                            .then(response => {
                                console.log(response);
                                console.log("Mail sent!");
                            })
                            .catch(err => {
                                console.log(err);
                                console.log("Mail failed to send");
                            });

                        // redirect to login page
                        res.redirect(nextPage ? nextPage : "/users/login");
                    })
                    .catch(err => console.log(err));
            });
        });
    }
});

// Login Page
router.get("/login", forwardAuthenticated, (req, res) => {
    res.render("login", {
        ...getCommonMetaData(req, "Login"),
    });
});

// Login handle
router.post("/login", (req, res, next) => {
    passport.authenticate("local", {
        successRedirect: "/account",
        failureRedirect: "/users/login",
        failureFlash: true,
    })(req, res, next);
});

// logout handle
router.get("/logout", (req, res) => {
    req.logout();
    req.flash("success_msg", "You have successfully logged out!");
    res.redirect("/users/login");
});

//Email confirmation
router.get("/confirm/:id", async (req, res) => {
    try {
        let user = await User.findById(req.params.id);
        user.confirm = true;
        await user.save();
        return res.render("confirm");
    } catch (err) {
        return res.render("500", {
            ...getCommonMetaData(req, "Something went wrong! Try again later."),
        });
    }
});

module.exports = router;
