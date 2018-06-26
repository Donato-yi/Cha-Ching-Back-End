import * as express from "express";
import * as cors from "cors";

import * as userController from "../controllers/user.controller";
import * as apiController from "../controllers/api.controller";
import * as transactionController from "../controllers/transaction.controller";
import * as connectionController from "../controllers/connection.controller";

const router = express.Router();

// options for cors midddleware
const options: cors.CorsOptions = {
  allowedHeaders: ["Origin", "X-Requested-With", "Content-Type", "Accept", "X-Access-Token", "Authorization"],
  origin: "*",
  credentials: true,
  methods: "GET,OPTIONS,PUT,POST,DELETE",
  preflightContinue: false,
};


router.options("*", cors(options));
router.use(cors(options));
router.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

// Authentication
router.post("/signup", userController.postSignup);
router.post("/facebook", userController.basicSignUp);
router.post("/login", apiController.getToken);
router.put("/logout", apiController.revokeToken);

// Confirmation
router.post("/verify/phone", userController.verifyPhone);
router.post("/verify/resendsms", userController.resendConfirmationSMS);

// Password Reset
router.post("/password/reset", apiController.sendResetPasswordCode);
router.put("/password/reset", apiController.resetPassword);


// Token authentication for all routes
router.use(apiController.verifyJwtToken);

// Two Factor Authentication
router.post("/account/2FA/:option", userController.enable2FA, apiController.verify2FA, apiController.dummy200("Phone verified !"));
router.put("/account/2FA/:option", apiController.verify2FA, userController.disable2FA);

// Account
router.get("/account/profile/:userId", userController.getProfile);
router.post("/account/profile/:userId", userController.postUpdateProfile);
router.post("/account/password/:userId", userController.postUpdatePassword);
router.post("/account/addFriendsFromFacebook/:userId", userController.addFriendsFromFacebook);
router.post("/account/find/:userId", userController.find);

// Transaction
router.post("/transaction/transfer/:userId", transactionController.transfer);
router.get("/transaction/history/:userId", transactionController.history);

// Connection
router.get("/connection/:userId", connectionController.getContacts);
router.get("/connection/pending/:userId", connectionController.getPendingInvitations);
router.post("/connection/invite/:userId/:friendId", connectionController.inviteFriend);
router.post("/connection/accept/:userId/:connectionId", connectionController.acceptInvitation);


router.options("*", cors(options));

module.exports = router;
