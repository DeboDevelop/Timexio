require("dotenv").config();
const express = require("express");
const expressLayouts = require("express-ejs-layouts");
const mongoose = require("mongoose");
const flash = require("connect-flash");
const session = require("express-session");
const passport = require("passport");
const json2Xls = require("json2xls");

const app = express();

// passport config
require("./config/passport")(passport);

// DB config
const db = require("./config/db");
mongoose
    .connect(db, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("MongoDB connected..."))
    .catch(err => console.log(err));

// express session
app.use(
    session({
        secret: "secret",
        resave: true,
        saveUninitialized: true,
    })
);

// passport middleware
app.use(passport.initialize());
app.use(passport.session());

// set the flash
app.use(flash());

// Global vars
app.use((req, res, next) => {
    res.locals.success_msg = req.flash("success_msg");
    res.locals.error_msg = req.flash("error_msg");
    res.locals.error = req.flash("error");
    res.locals.error_msg_list = req.flash("error_msg_list");
    next();
});

// EJS
app.use(expressLayouts);
app.set("view engine", "ejs");
app.set("layout extractScripts", true);

// routes for static files
app.use("/", express.static("static"));
app.use("/search", express.static("static"));
app.use("/product/:id/", express.static("static"));
app.use("/category", express.static("static"));
app.use("/account", express.static("static"));
app.use("/users", express.static("static"));
app.use("/users/confirm/:id", express.static("static"));
app.use("/admin", express.static("static"));
app.use("/admin/data", express.static("static/admin/"));
app.use("/admin/product/:id", express.static("static/admin/"));
app.use("/admin/user/:id", express.static("static/admin/"));
app.use("/admin/order/:id", express.static("static/admin/"));
app.use("/admin/customer-issues/:id", express.static("static/admin/"));

// for parsing the body
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// for parsing excel
app.use(json2Xls.middleware);

// Routes
app.use("/", require("./routes/index"));
app.use("/users", require("./routes/users"));
app.use("/account", require("./routes/account"));
app.use("/admin", require("./routes/admin"));
app.use("/admin/export", require("./routes/export"));

const PORT = process.env.PORT || 8000;
app.listen(PORT, console.log(`Server started http://localhost:${PORT}`));
