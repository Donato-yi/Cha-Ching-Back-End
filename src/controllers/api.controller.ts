"use strict";

import * as jwt from "jsonwebtoken";

import * as globalHelper from "../helpers/global";

import { User, UserModel } from "../models/User";
import { Response, Request, NextFunction } from "express";
import { WriteError } from "mongodb";
import * as crypto from "crypto";

import { ResponseModel } from "../models/ResponseModel";

// Sendgrid
const sendgrid = require("@sendgrid/client");
sendgrid.setApiKey(process.env.SENDGRID_APIKEY);

interface IRequest extends Request {
  decodedToken: any;
  token: string;
}

let start: any;
const authy = require("authy")(process.env.AUTHY_API_KEY);


const calculateRequestTime = () => {
  return +new Date();
};

const getMetaData = () => {
  const meta = {
    version: "1.0",
    received: start,
    executed: +new Date()
  };

  return meta;
};

const createResponse = (responseCode: number, data: any, errors: any) => {
  const respnseModel: ResponseModel = {
    data: data,
    meta: getMetaData(),
    response: {
      code: responseCode,
      errors: errors,
      message: (responseCode < 400) ? "OK" : "Error"
    }
  };

  return respnseModel;
};

/**
 * GET /api
 * List of APIs.
 */
export const getApi = (req: Request, res: Response) => {
  res.render("api/index", {
    title: "APIs"
  });
};

export const dummy200 = (message: string) => (req: IRequest, res: Response) => {
  return res.status(202).json(createResponse(200, { message: message }, {}));
};

export const logAll = (req: IRequest, res: Response, next: NextFunction) => {
  console.log(req.ip);
  return next();
};

export const verify2FA = (req: IRequest, res: Response, next: NextFunction) => {
  let p;

  if (req.decodedToken && req.decodedToken.id)
    p = User.findById(req.decodedToken.id).exec();
  else if (req.body && (req.body.login || req.body.email))
    p = User.findOne({ email: (req.body.login || req.body.email).toLowerCase() }).exec();
  else if (req.body && req.body.token)
    p = User.findOne({ passwordResetToken: req.body.token }).exec();
  else
    return res.status(400).json(createResponse(400, {}, { message: "Invalid authentication" }));

  p.then((user: UserModel) => {
    if (!user)
      return res.status(422).json(createResponse(400, {}, { message: "Invalid authentication" }));

    if (user.authy) {
      if (req.body.code === undefined) {
        authy.request_sms(user.authy.authyId, function (authyErr: any, authyRes: any) {

          if (authyErr) {
            console.log(`[USER] Error while Authy verification for user ${user._id}, error:`, authyErr);
            return res.status(500).json(createResponse(500, {}, authyErr));
          } else {
            console.log(`[USER] Authy verification result for user ${user._id}, response:`, authyRes);
            return res.status(202).json(createResponse(202, { message: "2FA Required" }, {}));
          }
        });
      }
      else
        authy.verify(user.authy.authyId, req.body.code, function (authyErr: any, authyRes: any) {
          if (authyErr) {
            if (user.authy.verified)
              return res.status(400).json(createResponse(400, {}, authyErr));
            else
              return next();
          }
          else if (!user.authy.verified) {
            user.authy.verified = true;
            user.save().then(() => {
              return next();
            });
          }
          else
            return next();
        });
    }
    else
      return next();
  }).catch((err: Error) => {
    return res.status(400).json(createResponse(400, {}, err));
  });
};


/**
 * Validate user login and return token
 */
export const getToken = (req: IRequest, res: Response) => {
  start = +new Date();

  req.assert("email").notEmpty().withMessage("Login is required");
  req.assert("password").notEmpty().withMessage("Password is required");

  const errors = req.validationErrors();
  if (errors) {
    console.log("[GET_TOKEN] Error on validation: ", errors);
    return res.status(422).json(createResponse(422, {}, errors));
  }

  User.findOne({
    // "$or": [
     /* { */ email: req.body.email.toLowerCase() /* }, */
    //    { username: { $regex: new RegExp("^" + req.body.login + "$", "i") } },
    //  ],
  }, (err, user: any) => {
    if (err) {
      console.log("[GET_TOKEN] Error while fetching user: ", err);
      return res.status(500).json(createResponse(500, {}, { status: "There is something went wrong. Please try again." }));
    }

    if (!user) {
      console.log("[GET_TOKEN] No user found with email: ", req.body.login);
      return res.status(422).json(createResponse(422, {}, { message: `Email or password is invalid.` }));
    }
    // If user not found than give login error

    // Disable email verification check temporarily
    // if (!user.email_verified) {
    //   console.log("[GET_TOKEN] User email is not verified: ", req.body.login);
    //   return res.status(422).json(createResponse(422, {}, { message: `Email is not confirmed.` }));
    // }

    // After validate user login name go for password validate
    user.comparePassword(req.body.password, (err: Error, isMatch: boolean) => {
      if (err) {
        console.log("[GET_TOKEN] Error while checking login password: ", err);
        return res.status(500).json(createResponse(500, {}, { status: "There is something went wrong. Please try again." }));
      }
      // If password matched than go for token
      if (isMatch) {
        // Return token
        const expireDate = Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 365 * 20);
        const addData = {
          id: user._id,
          username: user.email,
          exp: expireDate
        };

        jwt.sign(addData, process.env.JWT_SECRET_KEY, function (err: Error, token: any) {
          if (err) {
            console.log("[GET_TOKEN] Error while generating JWT token: ", err);
            return res.status(500).json(createResponse(500, {}, { status: "There is something went wrong. Please try again." }));
          }

          User.findById(user._id, (err, user: UserModel) => {
            user.token = token;
            user.save((err: WriteError) => {
              if (err) {
                console.log("[GET_TOKEN] Error while generating JWT token: ", err);
                return res.status(500).json(createResponse(500, {}, { status: "There is something went wrong. Please try again." }));
              }

              const data = {
                userId: user._id,
                token: token,
                lifetime: expireDate
              };

              return res.status(200).json(createResponse(200, data, {}));
            });
          });
        });
      }
      else {
        // if password didn't match, give error message.
        return res.status(422).json(createResponse(422, {}, { message: `Email or password is invalid.` }));
      }
    });
  });
};

export const revokeToken = (req: IRequest, res: Response) => {
  start = +new Date();

  const token = req.token || req.body.token || req.query.token;

  jwt.verify(token, process.env.JWT_SECRET_KEY, function (err: Error, decode: any) {
    if (err) {
      return res.status(500).json(createResponse(500, {}, err));
    } else {
      User.findOne({ token }, (err, user) => {
        if (err) {
          return res.status(500).json(createResponse(500, {}, err));
        }
        if (user) {
          User.findById(user._id, (err, user: UserModel) => {
            user.token = "";
            user.save((err: WriteError) => {
              if (err) {
                return res.status(500).json(createResponse(500, {}, err));
              }
              else { return res.status(200).json(createResponse(200, { message: "success" }, {})); }
            });
          });
        }
        else {
          return res.status(401).json(createResponse(401, {}, { message: "No Token found." }));
        }
      });
    }
  });
};

/**
 * Middleware: Verify JWT token is validate or not
 */
export const verifyJwtToken = (req: IRequest, res: Response, next: NextFunction) => {
  // Check header or url parameters or post parameters for token
  const token = req.body.token || req.query.token || req.headers["x-access-token"];

  // Verify and decode Token
  if (token) {
    jwt.verify(token, process.env.JWT_SECRET_KEY, function (err: Error, decode: any) {
      if (err) {
        return res.status(401).json(createResponse(401, {}, { message: "Invalid Token." }));
      } else {
        User.findOne({ token: token }).exec()
          .then(user => {
            if (user) {
              // token is valid
              req.decodedToken = decode;

              next();
            } else {
              // token is expired
              console.log(`[SECURITY] ${decode.username} trying to use an expired token.`, token, user);
              return res.status(401).json(createResponse(401, {}, { message: "Invalid Token." }));
            }
          })
          .catch(error => {
            if (error) {
              console.log(error);
              return res.status(500).json(createResponse(500, {}, { message: "Server error." }));
            }
          })
          ;

      }
    });
  } else {
    return res.status(401).json(createResponse(401, {}, { message: "No Token found." }));
  }
};

export const sendResetPasswordCode = (req: Request, res: Response) => {
  start = +new Date();
  req.assert("email").notEmpty().withMessage("Email is required");
  const errors = req.validationErrors();

  if (errors) {
    console.log(errors);
    return res.status(422).json(createResponse(422, {}, errors));
  }

  User.findOne({ email: req.body.email }, (err, user) => {
    if (err) {
      return res.status(500).json(createResponse(500, {}, err));
    }
    if (user) {
      User.findById(user._id, (err, user: UserModel) => {
        crypto.randomBytes(16, (err, buf) => {
          user.passwordResetCode = buf.toString("hex");
          const date = new Date();
          date.setHours(date.getHours() + 1);
          user.passwordResetExpires = date;
          user.save((err: WriteError) => {
            if (err) {
              return res.status(500).json(createResponse(500, {}, err));
            }
          });

          // Send verification code by SMS
        });
      });
    }
    else {
      return res.status(422).json(createResponse(422, {}, { message: "Invalid Email address." }));
    }
  });
};

export const resetPassword = (req: IRequest, res: Response) => {
  start = +new Date();
  req.assert("token").notEmpty().withMessage("Token is required.");
  req.assert("password", "Password is required.").notEmpty();

  const errors = req.validationErrors();
  if (errors) {
    console.log(errors);
    return res.status(422).json(createResponse(422, {}, errors));
  }

  User
    .findOne({ passwordResetToken: req.body.token })
    .where("passwordResetExpires").gt(Date.now())
    .exec((err, user: any) => {
      if (err) { return res.status(500).json(createResponse(500, {}, err)); }

      if (!user) {
        return res.status(422).json(createResponse(422, {}, { message: "Password reset token is invalid or has expired." }));
      }

      verify2FA(req, res, () => {
        user.password = req.body.password;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;

        user.save((err: WriteError) => {
          if (err) { return res.status(500).json(createResponse(500, {}, err)); }
          else { return res.status(200).json(createResponse(200, { message: "Password has been updated successfully." }, {})); }
        });
      });
    });
};
