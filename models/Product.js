const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    specs: {
        type: String,
        required: true,
    },
    price: {
        type: Number,
        required: true,
    },
    images: {
        type: Array,
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
    },
    tax: {
        type: Number,
        required: true,
    },
    category: {
        type: String,
        required: true,
    },
    created: {
        type: Date,
        default: Date.now,
    },
    sold: {
        type: Number,
        default: 0,
    },
    increasedMRP: {
        type: Number,
        required: true,
    },
    featured: {
        type: Boolean,
        default: false,
    },
    maillist: {
        type: Array,
        default: [],
    },
});

const Product = mongoose.model("Product", productSchema);

module.exports = Product;
