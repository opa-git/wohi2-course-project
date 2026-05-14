const jwt = require("jsonwebtoken");
const { UnauthorizedError, ForbiddenError } = require("../lib/errors");

const SECRET = process.env.JWT_SECRET;

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(new UnauthorizedError("No token provided"));
    }

  try {
    req.user = jwt.verify(authHeader.split(" ")[1], SECRET, {
      algorithms: ["HS256"]
    });

    next();
  } catch {
    next(new ForbiddenError("Invalid or expired token"));
  }
}

module.exports = authenticate;