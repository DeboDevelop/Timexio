const moment = require("moment");
const axios = require("axios");
const humanizeString = require("humanize-string");
const nodemailer = require("nodemailer");
const modelNames = require("../models/index");
const categories = require("../models/productCategories");
const algoliasearch = require("algoliasearch");
const settings = require("../settings");
const Order = require("../models/Orders");
const Issue = require("../models/Issue");
const { months } = require("moment");
const client = algoliasearch(process.env.ALGOLIA_APP_ID, process.env.ALGOLIA_ADMIN_API_KEY);

const getAdminMetaData = name => {
    return {
        layout: "adminLayout",
        name,
        modelNames,
        exportTypes: settings.exportTypes,
        textLimitter: (str, limit) => {
            if (str.length > limit) {
                return str.slice(0, limit).trim().concat("...");
            }
            return str;
        },
    };
};

const getFieldNames = model => {
    return Object.keys(model.schema.paths).filter(
        fieldName =>
            // fieldName !== "_id" &&
            fieldName !== "__v" &&
            fieldName !== "password" &&
            fieldName !== "category" &&
            fieldName !== "created" &&
            fieldName !== "specs" &&
            fieldName !== "date" &&
            fieldName !== "productId" &&
            fieldName !== "userId" &&
            fieldName !== "userFullName" &&
            fieldName !== "userCity" &&
            fieldName !== "paymentMethod" &&
            fieldName !== "paymentTimestamp" &&
            fieldName !== "deliveryAddress" &&
            fieldName !== "deliveryDate" &&
            fieldName !== "productCategory" &&
            fieldName !== "userPhoneNumber" &&
            fieldName !== "isNotCancelled" &&
            fieldName !== "userPincode"
    );
};

const humanizeFieldNames = names => {
    names = names.map(name => humanizeString(name));
    return names;
};

const getCommonMetaData = (req, title) => {
    return {
        title,
        name: req.user ? req.user.name : null,
        admin: req.user ? req.user.admin : null,
        isAuthenticated: req.isAuthenticated(),
        totalCartItems: req.user ? req.user.cart.length : null,
        categories,
    };
};

const getPriceDetails = cart => {
    const priceDetails = {
        shippingPrice: 0,
    };
    if (cart.length > 1) {
        priceDetails.items = cart.reduce((acc, current) => parseFloat(acc.quantity) + parseFloat(current.quantity));
        priceDetails.totalAmount = cart.reduce(
            (acc, current) =>
                parseFloat(acc.quantity) * parseFloat(acc.price) +
                parseFloat(current.quantity) * parseFloat(current.price)
        );
    } else if (cart.length === 1) {
        priceDetails.items = cart[0].quantity;
        priceDetails.totalAmount = cart[0].quantity * cart[0].price;
    }

    if (priceDetails.totalAmount < settings.minAmtReqForFreeDelivery) {
        priceDetails.shippingPrice = settings.shippingPrice;
    }
    return priceDetails;
};

const getIncome = order => order.price * order.quantity;

const payNow = order => {
    order.isPaid = true;
    order.markModified("isPaid");

    order.paymentTimestamp = new Date();
    order.markModified("paymentTimestamp");

    return order;
};

const setOrderToCancel = order => {
    order.isNotCancelled = false;
    order.markModified("isNotCancelled");
    return order;
};

const getTodayDateEndTime = () => {
    return `${moment().format("YYYY-MM-DD")}T00:00:01Z`;
};

const getMonthStartDate = () => {
    return `${moment().startOf("month").format("YYYY-MM-DD")}T00:00:00Z`;
};

const getMonthEndDate = () => {
    return `${moment().toISOString()}`;
};

// get total algolia records
const algoliaTotalRecords = () => {
    return new Promise(async (res, rej) => {
        try {
            const response = await axios.get(
                `https://usage.algolia.com/1/usage/records?startDate=${getMonthStartDate()}&endDate=${getTodayDateEndTime()}`,
                {
                    headers: {
                        "X-Algolia-API-Key": process.env.ALGOLIA_USAGE_API_KEY,
                        "X-Algolia-Application-Id": process.env.ALGOLIA_APP_ID,
                    },
                }
            );
            const record = response.data.records.pop();
            res(record.v);
        } catch (error) {
            rej(error.response.data.message);
        }
    });
};
// get total algolia search requests
const algoliaTotalSearchReqs = () => {
    return new Promise(async (res, rej) => {
        try {
            const response = await axios.get(
                `https://usage.algolia.com/1/usage/total_search_requests?startDate=${getMonthStartDate()}&endDate=${getMonthEndDate()}`,
                {
                    headers: {
                        "X-Algolia-API-Key": process.env.ALGOLIA_USAGE_API_KEY,
                        "X-Algolia-Application-Id": process.env.ALGOLIA_APP_ID,
                    },
                }
            );
            const record = response.data.total_search_requests.reduce(
                (acc, currVal) => {
                    return { v: acc.v + currVal.v };
                },
                { v: 0 }
            );
            res(record.v);
        } catch (error) {
            rej(error.response.data.message);
        }
    });
};

// Monthly income
const getMonthlyRevenue = () => {
    return new Promise(async (res, rej) => {
        const orders = await Order.find({}, (err, data) => {
            if (err) {
                rej(err);
            }
        });
        const currentMonth = new Date().getMonth();
        let monthlyIncome = 0;
        orders.forEach(order => {
            if (order.paymentTimestamp && new Date(order.paymentTimestamp).getMonth() === currentMonth) {
                monthlyIncome += getIncome(order);
            }
        });
        res(monthlyIncome);
    });
};

// Yearly income
const getYearlyRevenue = () => {
    return new Promise(async (res, rej) => {
        const orders = await Order.find({}, (err, data) => {
            if (err) {
                rej(err);
            }
        });
        const currentYear = new Date().getFullYear();
        let yearlyIncome = 0;
        orders.forEach(order => {
            if (order.paymentTimestamp && new Date(order.paymentTimestamp).getFullYear() === currentYear) {
                yearlyIncome += getIncome(order);
            }
        });
        res(yearlyIncome);
    });
};

const getEarningsOverview = () => {
    return new Promise(async (res, rej) => {
        const orders = await Order.find({}, (err, data) => {
            if (err) {
                rej(err);
            }
        });
        // get Earnings overview
        let lineChartData = [];

        let currentMonthIncome;
        for (let month = 0; month < 12; month++) {
            currentMonthIncome = 0;
            orders.forEach(order => {
                if (order.paymentTimestamp && new Date(order.paymentTimestamp).getMonth() === month) {
                    currentMonthIncome += getIncome(order);
                }
            });
            lineChartData.push(currentMonthIncome);
        }
        res(lineChartData);
    });
};

class Mail {
    constructor() {
        this.transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.MAIL_ID,
                pass: process.env.MAIL_PASSWORD,
            },
        });
    }

    signupSuccessful({ name, email, id }) {
        const mailOptions = {
            from: process.env.MAIL_ID,
            to: email,
            subject: `Welcome to Timexio, ${name}`,
            html: `<div style="
				background: #eee;
				padding: 2rem;
			"><h1>This is an automated email</h1><p>Now you can buy any products on our site!</p><a target="_blank" href="${process.env.URL}/users/confirm/${id}"><button style="
				padding: 1rem;
				background: #ff6a6a;
				color: #fff;
				font-size: 1.2rem;
				border: none;
				border-radius: 5px;
				">Confirm Email</button></a>
			</div>`,
        };
        return new Promise((resolve, reject) => {
            this.transporter.sendMail(mailOptions, (err, info) => {
                if (err) {
                    return reject(err);
                } else {
                    return resolve(info);
                }
            });
        });
    }
}

const getMonthlyIssues = () => {
    return new Promise(async (resolve, reject) => {
        const issues = await Issue.find({}, (err, data) => {
            if (err) {
                reject(err);
            }
            let monthlyIssueData = [];
            for (let month = 0; month < 12; month++) {
                let currentMonthlyIssues = 0;
                data.forEach(issue => {
                    if (issue.createdAt && new Date(issue.createdAt).getMonth() === month) {
                        currentMonthlyIssues++;
                    }
                });
                monthlyIssueData.push(currentMonthlyIssues);
            }
            resolve(monthlyIssueData);
        });
    });
};

module.exports = {
    client,
    getAdminMetaData,
    getFieldNames,
    getCommonMetaData,
    getPriceDetails,
    getIncome,
    payNow,
    setOrderToCancel,
    algoliaTotalRecords,
    algoliaTotalSearchReqs,
    getMonthlyRevenue,
    getYearlyRevenue,
    getEarningsOverview,
    humanizeFieldNames,
    Mail,
    getMonthlyIssues,
};
