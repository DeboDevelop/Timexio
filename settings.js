module.exports = {
    serverEnv: {
        PRODUCTION: "PRODUCTION",
        DEVELOPMENT: "DEVELOPMENT",
        BETA: "BETA",
    },
    siteName: "Timexio",

    // Currency -> In Indian Rupees
    shippingPrice: 50, // Delivery charge
    minAmtReqForFreeDelivery: 500, // Minimum this much amount is required to qualify for free delivery
    adminQuantityWarningCount: 5,
    maxAllowedQuantityPerItemInCart: 5, // user cannot have more than 5 quantity of same item in cart
    increasedMRP: 34, // increase the MRP by this %

    // Algolia
    algoliaMaxRecords: 10000,
    algoliaMaxSearchRequests: 10000,

    // export data of
    exportTypes: {
        monthlyIncome: "monthlyincome",
        users: "users",
        products: "products",
        orders: "orders",
        customerIssues: "customer-issues",
    },
};
