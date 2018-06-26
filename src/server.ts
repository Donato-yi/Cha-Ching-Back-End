/**
 * Module dependencies.
 */
import * as express from "express";
import * as compression from "compression";
import * as bodyParser from "body-parser";
import * as errorHandler from "errorhandler";
import * as lusca from "lusca";
import * as dotenv from "dotenv";
import * as mongoose from "mongoose";
import * as mongodb from "mongodb";
import * as expressValidator from "express-validator";

const bearerToken = require("express-bearer-token");

/**
 * Load environment variables from .env file, where API keys and passwords are configured.
 */
dotenv.config({ path: ".env" });


/**
 * Create Express server.
 */
const app = express();

/**
 * Connect to MongoDB.
 */
mongoose.plugin((schema: any) => {
  schema.options.usePushEach = true;
});
mongoose.connect(process.env.MONGODB_URI || process.env.MONGOLAB_URI);
mongoose.connection.on("error", () => {
  console.log("MongoDB connection error. Please make sure MongoDB is running.");
  process.exit();
});


/**
 * Express configuration.
 */
app.set("port", process.env.PORT || 3000);
app.set("trust proxy", "loopback");
app.use(compression());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(expressValidator());

app.use(lusca.xframe("SAMEORIGIN"));
app.use(lusca.xssProtection(true));

app.use(bearerToken());
app.use(errorHandler());

// Force no Caching
app.use((req, res, next) => {
  res.set("Cache-Control", "no-cache,no-store,must-revalidate");
  next();
});
app.use("/", require("./config/routes"));

/**
 * Start Express server.
 */
app.listen(app.get("port"), () => {
  console.log(("  App is running at http://localhost:%d in %s mode"), app.get("port"), app.get("env"));
  console.log("  Press CTRL-C to stop\n");
});

module.exports = app;
