const { handleApi } = require("../server");

module.exports = function handler(req, res) {
  return handleApi(req, res);
};
