const express = require("express");
const bcryptjs = require("bcryptjs");
const moment = require("moment");
const { maxAllowedQuantityPerItemInCart } = require("../settings");

const router = express.Router();

const { getCommonMetaData, getPriceDetails, setOrderToCancel } = require("./utils");
const User = require("../models/User");
const { ensureAuthenticated } = require("../config/auth");
const Order = require("../models/Orders");
const Product = require("../models/Product");
const Issue = require("../models/Issue");

//* ======= PRIVATE ROUTES BELOW! ======= //
//===============
// Account Page
//===============
router.get("/", ensureAuthenticated, (req, res) => {
    res.render("account/userAccount", {
        ...getCommonMetaData(req, "Account"),
    });
});

router.get("/credentials", ensureAuthenticated, (req, res) => {
    res.render("account/credentials", {
        ...getCommonMetaData(req, "Account Credentials"),
        user: req.user,
    });
});

router.post("/credentials/:type", ensureAuthenticated, async (req, res) => {
    // update profile
    if (req.params.type === "profile") {
        const { name, email } = req.body;

        // check if the email is already present or not
        try {
            const emailIsTaken = req.user.email === email ? false : await User.findOne({ email });

            if (!emailIsTaken) {
                const user = await User.findById(req.user.id);
                user.name = name;
                user.email = email;
                await user.save();

                req.flash("success_msg", "Credentials have been updated!");
                return res.redirect("back");
            }

            req.flash("error_msg", "This email is already taken!");
            return res.redirect("back");
        } catch (error) {
            console.log(error);
            req.flash("error_msg", "Something went wrong. Try again later!");
            return res.redirect("back");
        }
    }
    // change password
    else if (req.params.type === "changepassword") {
        const { currentPassword, newPassword, confirmPassword } = req.body;

        if (newPassword === currentPassword) {
            req.flash("error_msg", "Your new password must be different from your old password!");
            return res.redirect("back");
        } else if (newPassword === confirmPassword) {
            try {
                const user = await User.findById(req.user.id);
                const salt = await bcryptjs.genSalt(10);
                const hash = await bcryptjs.hash(newPassword, salt);

                user.password = hash;
                await user.save();
                req.flash("success_msg", "Password have been updated!");
                return res.redirect("back");
            } catch (error) {
                console.log(error);
                req.flash("error_msg", "Something went wrong. Try again later!");
                return res.redirect("back");
            }
        } else {
            req.flash("error_msg", "Your new password must match with your confirm password");
            return res.redirect("back");
        }

        // check if the email is already present or not
        try {
            const emailIsTaken = req.user.email === email ? false : await User.findOne({ email });

            if (!emailIsTaken) {
                const user = await User.findById(req.user.id);
                user.name = name;
                user.email = email;
                await user.save();

                req.flash("success_msg", "Credentials have been updated!");
                return res.redirect("back");
            }

            req.flash("error_msg", "This email is already taken!");
            return res.redirect("back");
        } catch (error) {
            console.log(error);
            req.flash("error_msg", "Something went wrong. Try again later!");
            return res.redirect("back");
        }
    }
    return res.redirect("back");
});

//===============
// cart page
//===============
router.get("/cart", ensureAuthenticated, async (req, res) => {
    let cartItems = [],
        priceDetails;
    await User.findById(req.user.id, (error, user) => {
        if (error) {
            return res.render("500", {
                title: "Something went wrong! Try again later.",
            });
        }
        if (user) {
            cartItems = [...user.cart];
            priceDetails = getPriceDetails(cartItems);

            return res.render("account/cart", {
                ...getCommonMetaData(req, "Showing all products in your cart"),
                cartItems,
                userId: req.user.id,
                priceDetails,
            });
        }
    });
});

// adds new product to cart
router.post("/cart/:id/add", ensureAuthenticated, async (req, res) => {
    const productId = req.params.id;

    User.findById(req.user.id, async (error, user) => {
        if (user) {
            let cartItem = user.cart.find(item => item.id === productId);

            if (cartItem) {
                user.cart = user.cart.map(itemInCart => {
                    if (itemInCart.id === productId) {
                        itemInCart.quantity < maxAllowedQuantityPerItemInCart
                            ? itemInCart.quantity++
                            : itemInCart.quantity;
                    }
                    return itemInCart;
                });
                user.markModified("cart");
            } else {
                try {
                    await Product.findById(productId, (error, product) => {
                        if (product) {
                            user.cart.unshift({
                                id: product.id,
                                name: product.name,
                                image: product.images[0],
                                price: product.price + (product.tax / 100) * product.price,
                                quantity: 1,
                                category: product.category,
                            });
                        }
                    });
                } catch (error) {
                    console.log(error);
                }
            }
            try {
                await user.save();
                res.redirect("/account/cart");
            } catch (error) {
                console.log(error);
            }
        } else {
            req.flash("error_msg", "Something went wrong! Try again later");
            res.redirect("back");
        }
    });
});

// route to update quantity of specific item in cart
router.patch("/cart/update", async (req, res) => {
    const { updatedQuantity, userId, productId } = req.body;

    try {
        let user, product;

        await User.findById(userId, (err, userItem) => {
            if (err) {
                return res.status(500).json({ error: "Server Error! Something went wrong" });
            }
            if (userItem) {
                user = userItem;
            } else {
                return res.status(404).json({ error: "User Not Found" });
            }
        });

        await Product.findById(productId, (err, productItem) => {
            if (err) {
                return res.status(500).json({ error: "Server Error! Something went wrong" });
            }
            if (productItem) {
                product = productItem;
            } else {
                return res.status(404).json({ error: "Product Not Found" });
            }
        });

        user.cart.forEach(cartItem => {
            if (cartItem.id === product.id) {
                cartItem.quantity = updatedQuantity;
                user.markModified("cart");
            }
        });

        await user.save();
        return res.status(200).json({ userId: userId, productId: productId, updatedQuantity });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

// route to delete specific item in cart
router.delete("/cart/delete", async (req, res) => {
    const { productId, userId } = req.body;

    try {
        let user, product;

        await User.findById(userId, (err, userItem) => {
            if (err) {
                return res.status(500).json({ error: "Server Error! Something went wrong" });
            }
            if (userItem) {
                user = userItem;
            } else {
                return res.status(404).json({ error: "User Not Found" });
            }
        });

        await Product.findById(productId, (err, productItem) => {
            if (err) {
                return res.status(500).json({ error: "Server Error! Something went wrong" });
            }
            if (productItem) {
                product = productItem;
            } else {
                return res.status(404).json({ error: "Product Not Found" });
            }
        });

        user.cart = user.cart.filter(item => {
            if (item.id !== productId) {
                return true;
            } else {
                user.markModified("cart");
                return false;
            }
        });

        await user.save();
        return res.status(200).json({ userId: userId, productId: productId });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: error.message });
    }
});

//===============
// checkout page
//===============

// view checkout page
router.get("/checkout", ensureAuthenticated, (req, res) => {
    const userCart = req.user.cart;
    const priceDetails = getPriceDetails(userCart);

    if (req.user.confirm === false) {
        return res.render("notconfirmed", {
            ...getCommonMetaData(req, "Unconfirmed Account!"),
        });
    }

    res.render("account/checkout", {
        ...getCommonMetaData(req, "Checkout"),
        priceDetails,
    });
});

router.post("/checkout", ensureAuthenticated, async (req, res) => {
    const {
        fullName: userFullName,
        phoneNumber: userPhoneNumber,
        email: userEmail,
        deliveryAddress,
        city: userCity,
        pincode: userPincode,
    } = req.body;

    let user, order;

    await User.findById(req.user.id, (err, item) => {
        if (err) {
            return res.render("500");
        }
        user = item;
    });

    const userCart = user.cart;

    for (const cartItem of userCart) {
        order = new Order({
            productId: cartItem.id,
            productName: cartItem.name,
            productCategory: cartItem.category,
            price: cartItem.price,
            quantity: cartItem.quantity,
            image: cartItem.image,
            userId: user.id,
            userFullName,
            userEmail,
            userPhoneNumber,
            deliveryAddress,
            userCity,
            userPincode,
        });
        try {
            await order.save();

            user.orders.push({
                id: order.id,
                deliveryDate: order.deliveryDate,
                isNotCancelled: order.isNotCancelled,
            });
            user.markModified("orders");

            user.cart = [];
            user.markModified("cart");

            await user.save();
        } catch (error) {
            console.log(error);
            return res.redirect("500");
        }
    }
    return res.render("account/successfulCheckout", {
        ...getCommonMetaData(req, "Order Placed Successfully!"),
    });
});

//===============
// All Orders page
//===============
router.get("/orders", ensureAuthenticated, async (req, res) => {
    try {
        const userId = await User.findById(req.user.id);
        const orders = (await Order.find({ userId: userId.id })).reverse();

        return res.render("account/orders", {
            ...getCommonMetaData(req, "All Orders"),
            orders,
        });
    } catch (error) {
        console.log(error);
        return res.render("500", {
            ...getCommonMetaData(req, "Something went wrong"),
        });
    }
});

router.patch("/orders/cancel", ensureAuthenticated, async (req, res) => {
    const orderId = req.body.id;

    try {
        let order = await Order.findById(orderId);
        order = setOrderToCancel(order);
        await order.save();
    } catch (error) {
        console.log(error);
        return res.render("500", {
            ...getCommonMetaData(req, "Something went wrong"),
        });
    }
    return res.status(200).json({ message: "Order cancelled successfully!" });
});

//===============
// All issues page
//===============

router.get("/issues", ensureAuthenticated, async (req, res) => {
    const allIssues = (await Issue.find({ email: req.user.email })).reverse();
    res.render("account/issues", {
        ...getCommonMetaData(req, "All Issues"),
        allIssues,
    });
});

router.post("/issues/new", ensureAuthenticated, async (req, res) => {
    const { phone, subject, message } = req.body;
    const { email, name } = req.user;

    if (!phone || !subject || !message) {
        req.flash("error_msg", "Please fill up all fields!");
    } else {
        const newIssue = new Issue({
            name,
            email,
            phone,
            subject,
            message,
        });
        await newIssue.save();
        req.flash("success_msg", "Your issue has been created successfully!");
    }

    res.redirect("/account/issues");
});

router.post("/issues/update", ensureAuthenticated, async (req, res) => {
    const { issueId } = req.body;
    try {
        console.log(issueId);
        const issue = await Issue.findOne({ _id: issueId, email: req.user.email });
        console.log(issue);
        if (issue) {
            issue.closedDate = moment().format("Do MMMM, YYYY");
            issue.markModified("closedDate");
            await issue.save();
        }
        return res.redirect("/account/issues");
    } catch (error) {
        console.log(error);
        return res.render("500", {
            ...getCommonMetaData(req, "Something went wrong!"),
        });
    }
});

module.exports = router;
