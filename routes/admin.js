const express = require("express");
const moment = require("moment");
const { client, getMonthlyRevenue, getYearlyRevenue, getEarningsOverview, getMonthlyIssues } = require("./utils");
const { setAdminCommonData } = require("../middleware/admin");

const {
    getAdminMetaData,
    getFieldNames,
    payNow,
    algoliaTotalRecords,
    algoliaTotalSearchReqs,
    humanizeFieldNames,
} = require("./utils");
const router = express.Router();
const { ensureAuthenticated, ensureAdminAuthorized } = require("../config/auth");
const User = require("../models/User");
const Product = require("../models/Product");
const productCategories = require("../models/productCategories");
const Order = require("../models/Orders");
const Issue = require("../models/Issue");
const { increasedMRP, algoliaMaxRecords, algoliaMaxSearchRequests } = require("../settings");
const settings = require("../settings");
const { PriceDropMail, OrderDeliver } = require("./utils");

const index = client.initIndex("products");

// ** Working GET Route for admin dashboard **
router.get("/", ensureAuthenticated, ensureAdminAuthorized, setAdminCommonData, async (req, res) => {
    const orders = await Order.find({});
    const data = {};

    // Monthly income
    data.monthlyIncome = await getMonthlyRevenue();

    // Yearly income
    data.yearlyIncome = await getYearlyRevenue();

    // deliverd orders (%)
    if (orders.length > 0) {
        let ordersDelivered = 0;
        orders.forEach(order => {
            if (order.deliveryDate) {
                ordersDelivered++;
            }
        });
        data.ordersDelivered = Math.round((ordersDelivered / orders.length) * 100);
    } else {
        data.ordersDelivered = 0;
    }

    // total customers
    data.totalCustomers = (await User.find({ admin: { $ne: true } })).length;

    // get Earnings overview
    data.lineChartData = await getEarningsOverview();

    // get Monthly Issues overview
    data.monthlyIssuesData = await getMonthlyIssues();

    // get pending orders
    data.pendingOrders = 0;
    orders.forEach(order => {
        if (order.deliveryDate === null && order.isNotCancelled) {
            data.pendingOrders++;
        }
    });

    // calculate total algolia search records used so far
    try {
        const totalRecords = await algoliaTotalRecords();
        data.algoliaTotalRecordsUsed = (totalRecords / algoliaMaxRecords) * 100;
    } catch (error) {
        console.log(error);
    }

    // calculate total algolia search requests used so far
    try {
        const totalSearchReqs = await algoliaTotalSearchReqs();
        data.algoliaTotalSearchReqsUsed = (totalSearchReqs / algoliaMaxSearchRequests) * 100;
    } catch (error) {
        console.log(error);
    }

    res.render("admin/index", {
        ...res.commonData,
        data,
    });
});

/*===================================================*/
//***************** PRODUCT ROUTES *******************
/*===================================================*/

// ** setting the GET Routes for Product listing page **
productCategories.forEach(category => {
    router.get(`/${category}`, ensureAuthenticated, ensureAdminAuthorized, (req, res) => {
        Product.find({ category }, (err, data) => {
            if (err) {
                console.log(err);
            }
            fields = getFieldNames(Product);
            res.render("admin/productData", {
                ...getAdminMetaData(req.user.name),

                currentModel: category,
                productCategories: productCategories,
                humanizedFields: humanizeFieldNames(fields),
                fields,
                data,
                adminQuantityWarningCount: settings.adminQuantityWarningCount,
            });
        });
    });
});

// GET - fetch specific product
router.get("/product/:id/details", ensureAuthenticated, ensureAdminAuthorized, (req, res) => {
    // get the id from req params
    const id = req.params.id;

    // check if the product with that id exists
    Product.findById(id, (error, product) => {
        if (error) {
            res.render("500");
        }
        // if item is found
        if (product) {
            return res.render("admin/productDetails", {
                ...getAdminMetaData(req.user.name),
                productCategories,
                product,
            });
        }
        return res.render("404");
    });
});
// POST - add new product
router.post("/product/add", ensureAuthenticated, ensureAdminAuthorized, (req, res) => {
    const { category, name, price, quantity, tax, primaryImage, productImage1, productImage2, productImage3, specs } =
        req.body;

    const newProduct = new Product({
        category,
        name,
        price,
        quantity,
        tax,
        images: [primaryImage, productImage1, productImage2, productImage3],
        specs,
        increasedMRP: parseInt(price) + (parseInt(price) * increasedMRP) / 100,
    });

    if (category === "none") {
        req.flash("error_msg", "Error adding new product due to invalid input!");
        res.redirect(`back`);
    } else {
        newProduct
            .save()
            .then(product => {
                // save in algolia
                index
                    .saveObject(product, { autoGenerateObjectIDIfNotExist: true })
                    .then(algoliaResponse => {
                        console.log(algoliaResponse);
                        req.flash("success_msg", `New ${product.category} has been added!`);
                        res.redirect("back");
                    })
                    .catch(err => {
                        console.log("failed to save in algolia");
                        console.log(err.message);
                    });
            })
            .catch(err => {
                console.log(err);
                req.flash("error_msg", "Internal error occured :(");
                res.redirect(`back`);
            });
    }
});

// POST - update specific product
router.post("/product/:id/edit", ensureAuthenticated, ensureAdminAuthorized, (req, res) => {
    // get the id from req params
    const id = req.params.id;

    // check if the product with that id exists
    Product.findById(id, (error, item) => {
        // if not send 404
        if (error) {
            req.flash("error_msg", "Product not found for update");
            return res.redirect("back");
        }

        // if item is found
        else if (item) {
            const {
                category,
                name,
                price,
                quantity,
                tax,
                primaryImage,
                productImage1,
                productImage2,
                productImage3,
                specs,
                featured,
            } = req.body;

            const images = [primaryImage, productImage1, productImage2, productImage3];

            // validate the params
            // ! skipped
            // if invalid send 400 (bad request)
            // ! skipped

            // else perform update
            item.category = category;
            item.name = name;
            item.price = price;
            item.tax = tax;
            item.specs = specs;
            item.images = images;
            item.quantity = quantity;
            item.featured = featured;

            item.save()
                .then(item => {
                    req.flash("success_msg", "Product updated successfully!");
                    console.log("Inside Item Save: ", item);
                    const newMail = new PriceDropMail();
                    newMail.signupSuccessful(item);
                    return res.redirect("back");
                })
                .catch(err => {
                    console.log("Error in Product Update", err);
                    req.flash("error_msg", "Internal error occured. Try again later!");
                    return res.redirect("back");
                });
        } else {
            req.flash("error_msg", "Product not found for update");
            return res.redirect("back");
        }
    });
});

//  DELETE - delete a specific Product
router.delete("/product/:id/delete", (req, res) => {
    // get the id from req params
    const id = req.params.id;

    // check if the product with that id exists
    Product.findByIdAndDelete(id, (error, responseDoc) => {
        // if not send 404
        if (error) {
            return res.status(400).json({ status: 400, error: "Bad Request" });
        }

        // if item is found
        else if (responseDoc) {
            return res.status(200).json(responseDoc);
        } else {
            return res.status(404).json({ status: 404, error: "Product Not Found" });
        }
    });
});

/*===================================================*/
//***************** USER ROUTES **********************
/*===================================================*/

// ** Working GET Route for User **
router.get("/user", ensureAuthenticated, ensureAdminAuthorized, (req, res) => {
    const users = User.find({}, (err, data) => {
        if (err) {
            console.log(err);
        }
        fields = getFieldNames(User);
        res.render("admin/userData", {
            ...getAdminMetaData(req.user.name),

            currentModel: User,
            humanizedFields: humanizeFieldNames(fields),
            fields,
            data,
        });
    });
});

// GET - fetch particular user's details
router.get("/user/:id/details", ensureAuthenticated, ensureAdminAuthorized, (req, res) => {
    // get the id from req params
    const id = req.params.id;

    // check if the product with that id exists
    User.findById(id, (error, user) => {
        if (error) {
            return res.render("500");
        }
        // if item is found
        if (user) {
            // const { id, name, email, password, date, admin } = item;

            return res.render("admin/userDetails", {
                ...getAdminMetaData(req.user.name),
                user,
            });
        }
        return res.render("404");
    });
});

// POST - update a specific User's details
router.post("/user/:id/edit", ensureAuthenticated, ensureAdminAuthorized, (req, res) => {
    // get the id from req params
    const id = req.params.id;

    // check if the product with that id exists
    User.findById(id, (error, item) => {
        // if not send 404
        if (error) {
            req.flash("error_msg", "User not found for update");
            return res.redirect("back");
        }

        // if item is found
        else if (item) {
            const { name, email, admin } = req.body;

            // validate the params
            // ! skipped
            // if invalid send 400 (bad request)
            // ! skipped

            // else perform update
            item.name = name;
            item.email = email;
            item.admin = admin == "true" ? true : false;

            item.save()
                .then(item => {
                    req.flash("success_msg", "User info updated successfully!");
                    return res.redirect("back");
                })
                .catch(err => {
                    req.flash("error_msg", "Internal error occured. Try again later!");
                    return res.redirect("back");
                });
        } else {
            req.flash("error_msg", "User not found for update");
            return res.redirect("back");
        }
    });
});

//  DELETE - delete a specific User
router.delete("/user/:id/delete", (req, res) => {
    // get the id from req params
    const id = req.params.id;

    // check if the product with that id exists
    User.findByIdAndDelete(id, (error, responseDoc) => {
        // if not send 404
        if (error) {
            return res.status(400).json({ status: 400, error: "Bad Request" });
        }

        // if item is found
        else if (responseDoc) {
            return res.status(200).json(responseDoc);
        } else {
            return res.status(404).json({ status: 404, error: "User Not Found" });
        }
    });
});

/*===================================================*/
//***************** ORDER ROUTES *********************
/*===================================================*/

router.get("/order", ensureAuthenticated, ensureAdminAuthorized, (req, res) => {
    Order.find({}, (err, orders) => {
        if (err) {
            res.render("500", {
                ...getAdminMetaData(req.user.name),
            });
        }
        orders = orders.reverse();
        fields = getFieldNames(Order);
        return res.render("admin/orderData", {
            ...getAdminMetaData(req.user.name),
            currentModel: Order.modelName,
            humanizedFields: humanizeFieldNames(fields),
            fields,
            data: orders,
        });
    });
});

router.get("/order/:id/details", ensureAuthenticated, ensureAdminAuthorized, async (req, res) => {
    const id = req.params.id;
    //todo - set up the form for order details

    let order = "";
    await Order.findById(id, (err, data) => {
        if (err) {
            return res.render("500", {
                ...getAdminMetaData(req.user.name),
            });
        } else if (data) {
            order = data;
        } else {
            return res.render("400", {
                ...getAdminMetaData(req.user.name),
            });
        }
    });

    return res.render("admin/orderDetails", {
        ...getAdminMetaData(req.user.name),
        order,
    });
});

router.patch("/order/:id/deliver", async (req, res) => {
    const id = req.params.id;
    let order, user, product;

    try {
        order = await Order.findById(id);
        user = await User.findById(order.userId);
        product = await Product.findById(order.productId);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Something went wrong! Try again later" });
    }

    if (product.quantity >= order.quantity) {
        const timestamp = moment().format("Do MMMM, YYYY");
        user.orders.forEach(userOrder => {
            if (order.id == userOrder.id) {
                // update user's pending order status
                userOrder.deliveryDate = timestamp;
                user.markModified("orders");
            }
        });

        // reduce the product quantity
        product.quantity -= order.quantity;
        product.markModified("quantity");

        // increase sold count for the product
        product.sold += order.quantity;
        product.markModified("sold");

        // update order status for admin panel
        order.deliveryDate = timestamp;
        order.markModified("deliveryDate");

        order = payNow(order);

        try {
            await user.save();
            await product.save();
            await order.save();
        } catch (error) {
            console.log(error);
            return res.status(500).json({ message: "Something went wrong! Try again later" });
        }
        // console.log("User: ", user);
        // console.log("Product: ", product);
        // console.log("Order: ", order);
        const newMail = new OrderDeliver();
        newMail
            .signupSuccessful({ user, product, order })
            .then(response => {
                console.log(response);
                console.log("Mail sent!");
            })
            .catch(err => {
                console.log(err);
                console.log("Mail failed to send");
            });
        return res.status(200).json({ message: "Order delivered successfully!" });
    } else {
        return res.status(405).json({ message: "You don't have enough quantity of this product to deliver." });
    }
});

router.patch("/order/cancel", async (req, res) => {
    const orderId = req.body.id;
    try {
        const order = await Order.findById(orderId);
        order.isNotCancelled = false;
        order.markModified("isNotCancelled");
        await order.save();
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Something went wrong" });
    }
    return res.status(200).json({ message: "Order cancelled successfully!" });
});

router.delete("/order/delete", async (req, res) => {
    const { orderId, userId } = req.body;
    try {
        await Order.findByIdAndDelete(orderId);

        const user = await User.findById(userId);
        user.orders = user.orders.filter(item => item.id !== orderId);
        user.markModified("orders");
        await user.save();

        return res.status(200).json({ next: "/admin/order" });
    } catch (error) {
        return res.status(500).json({ error: "Something went wrong! Item is not removed." });
    }
});

/*===============================================================*/
//***************** FEATURED PRODUCTS ROUTES *********************
/*===============================================================*/

router.get("/featured-products", ensureAuthenticated, ensureAdminAuthorized, async (req, res) => {
    const featuredProducts = await Product.find({ featured: true });

    const data = featuredProducts.reverse();
    fields = getFieldNames(Product);

    res.render("admin/featuredProducts", {
        ...getAdminMetaData(req.user.name),
        humanizedFields: humanizeFieldNames(fields),
        fields,
        data,
        adminQuantityWarningCount: settings.adminQuantityWarningCount,
    });
});

/*===============================================================*/
//***************** ISSUES ROUTES *********************
/*===============================================================*/

router.get("/customer-issues", ensureAuthenticated, ensureAdminAuthorized, async (req, res) => {
    const fields = getFieldNames(Issue);
    try {
        const issues = (await Issue.find({})).reverse();
        return res.render("admin/issuesData", {
            ...getAdminMetaData(req.user.name),
            humanizedFields: humanizeFieldNames(fields),
            fields,
            data: issues,
        });
    } catch (error) {
        console.log(error);
        return res.render("500", {
            ...getAdminMetaData(req.user.name),
        });
    }
});

router.get("/customer-issues/:issueId/details", ensureAuthenticated, ensureAdminAuthorized, async (req, res) => {
    try {
        const issue = await Issue.findById(req.params.issueId);
        if (issue) {
            return res.render("admin/issueDetails", {
                ...getAdminMetaData(req.user.name),
                data: issue,
            });
        }
        return res.render("404", {
            ...getAdminMetaData(req.user.name),
        });
    } catch (error) {
        console.log(error);
        return res.render("500", {
            ...getAdminMetaData(req.user.name),
        });
    }
});

router.post("/customer-issues/close", ensureAuthenticated, ensureAdminAuthorized, async (req, res) => {
    try {
        const issue = await Issue.findById(req.body.issueId);
        if (issue) {
            issue.closedDate = moment().format("Do MMMM, YYYY");
            issue.markModified("closedDate");
            issue.save();
            return res.redirect(`/admin/customer-issues/${issue.id}/details`);
        }
        return res.render("admin/404", {
            ...getAdminMetaData(req.user.name),
        });
    } catch (error) {
        console.log(error);
        return res.render("500", {
            ...getAdminMetaData(req.user.name),
        });
    }
});

router.delete("/customer-issues/:id/delete", ensureAuthenticated, ensureAdminAuthorized, async (req, res) => {
    const id = req.params.id;
    if (id) {
        try {
            const issue = await Issue.findByIdAndDelete(id);
            if (issue) {
                return res.status(200).json({ issue, message: "Issue is deleted successfully!" });
            }
            return res.status(404).json({ error: "Issue is not found" });
        } catch (error) {
            console.log(error);
            return res.status(500).json({ error: "Something went wrong" });
        }
    }
    return res.status(401).json({ error: "Bad Request" });
});

module.exports = router;
