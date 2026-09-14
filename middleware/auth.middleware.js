const jwt = require("jsonwebtoken");

const auth = (req, res, next) => {
    const header = req.headers.authorization;

    if (!header?.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "Not authorized"
        });
    }

    const token = header.split(" ")[1];

    try {
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        req.user = {
            id: decoded.id
        };

        next();

    } catch (error) {

        console.error(
            "JWT verification error:",
            error.message
        );

        return res.status(401).json({
            success: false,
            message: "Invalid token"
        });
    }
};

module.exports = auth;