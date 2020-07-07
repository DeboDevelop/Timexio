const modelNames = require("../models/index");
const categories = require("../models/productCategories");

const {
	ensureAuthenticated,
	ensureAdminAuthorized
} = require("../config/auth");
const Product = require("../models/Product");

const getAdminMetaData = name => {
	return {
		layout: "adminLayout",
		name,
		modelNames
	};
};

const getFieldNames = model => {
	return Object.keys(model.schema.paths).filter(
		fieldName =>
			fieldName !== "_id" &&
			fieldName !== "__v" &&
			fieldName !== "password" &&
			fieldName !== "category" &&
			fieldName !== "created" &&
			fieldName !== "images" &&
			fieldName !== "specs"
	);
};

const setProductsRoutes = (router, categories) => {
	categories.forEach(category => {
		router.get(
			`/${category}`,
			ensureAuthenticated,
			ensureAdminAuthorized,
			(req, res) => {
				Product.find({ category }, (err, data) => {
					if (err) {
						console.log(err);
					}

					res.render("admin/productData", {
						...getAdminMetaData(req.user.name),

						currentModel: category,
						productCategories: categories,
						fields: getFieldNames(Product),
						data: data.map(item => {
							return {
								id: item.id,
								name: item.name,
								specs: item.specs,
								price: item.price,
								images: item.images,
								quantity: item.quantity,
								tax: item.tax,
								created: item.created
							};
						})
					});
				});
			}
		);
	});
};

const getCommonMetaData = (req, title) => {
	return {
		title,
		name: req.user ? req.user.name : null,
		admin: req.user ? req.user.admin : null,
		isAuthenticated: req.isAuthenticated(),
		categories
	};
};

module.exports = {
	getAdminMetaData,
	getFieldNames,
	setProductsRoutes,
	getCommonMetaData
};
