import * as async from "async";
import * as crypto from "crypto";

import { Document } from 'mongoose';
import { Request, Response, NextFunction } from "express";
import { WriteError } from "mongodb";

import * as twilio from '../helpers/twilioHelper';
import * as globalHelper from "../helpers/global";

import { User, UserModel } from "../models/User";
import { Connection } from "../models/Connection";
import { ResponseModel } from "../models/ResponseModel";



let start: any;
const authy = require("authy")(process.env.AUTHY_API_KEY);

interface IRequest extends Request {
  decodedToken: any;
  token: string;
}

/**
 * Enable 2 Factor Authentication.
 */
export const enable2FA = (req: IRequest, res: Response, next: NextFunction) => {
  if (req.body.code)
    return next();

  User.findById(req.decodedToken.id, (err, user) => {
    if (!user)
      return res.status(400).json(createResponse(400, {}, { message: "User not found." }));

    const saveUser = (endsHere: Boolean) => {
      return user.save().then(savedUser => {
        if (endsHere)
          res.status(201).json(createResponse(201, {
            "success": true,
            "userId": savedUser._id,
            "authyId": savedUser.authy.authyId,
          }, {}));
      });
    };

    if (!user.authy.authyId) {
      if (!(user.phone && user.countryCode))
        return res.status(400).json(createResponse(400, {}, { message: "User phone not valid." }));

      authy.register_user(user.email, user.phone, user.countryCode.toString(), function (errAuthy: any, resAuthy: any) {
        if (errAuthy) {
          console.log(errAuthy);
          return res.status(500).json(createResponse(500, {}, errAuthy));
        }
        user.authy.authyId = resAuthy.user.id;
        user.authy.verified = false;

        console.log(`[USER] Authy enabled for user ${user._id}, response:`, resAuthy);

        saveUser(false).then(next);
      });
    }
    else
      return saveUser(true);
  });
};

export const disable2FA = (req: IRequest, res: Response, next: NextFunction) => {
  User.findById(req.decodedToken.id, (err, user) => {
    if (!user)
      return res.status(400).json(createResponse(400, {}, { message: "User not found." }));

    const saveUser = () => {
      user.save().then(savedUser => {
        return res.status(201).json(createResponse(201, {
          "success": true,
          "userId": savedUser._id,
          "authyId": savedUser.authy && savedUser.authy.authyId,
        }, {}));
      });
    };

    authy.delete_user(user.authy.authyId, function (errAuthy: any, resAuthy: any) {
      if (errAuthy) {
        console.log(errAuthy);
        return res.status(500).json(createResponse(500, {}, errAuthy));
      }
      user.authy = undefined;
      saveUser();
    });
  });
};

export const postSignup = (req: IRequest, res: Response, next: NextFunction) => {
  start = +new Date();
  req.assert("password", "required").notEmpty().withMessage("Password is required");
  req.assert("password", "unsafe").len({ min: 6 }).withMessage("Password too short");
  req.assert("password", "unsafe").matches(/[a-z]/).withMessage("Password must contain at least 1 lowercase character");
  req.assert("password", "unsafe").matches(/[A-Z]/).withMessage("Password must contain at least 1 uppercase character");
  req.assert("password", "unsafe").matches(/[0-9]/).withMessage("Password must contain at least 1 digit");

  req.getValidationResult().then((result) => {
    if (!result.isEmpty()) {
      const error = result.array().map(error => error.msg);
      return res.status(422).json(createResponse(422, {}, error));
    } else {
      basicSignUp(req, res, next);
    }
  });
};

export const basicSignUp = (req: IRequest, res: Response, next: NextFunction) => {
  start = +new Date();
  req.assert("email", "not-valid").isEmail().withMessage("Wrong email format");
  req.sanitize("email").normalizeEmail({ gmail_remove_dots: false });
  if (!req.body.username && !(req.body.firstname && req.body.lastname))
    return res.status(422).json(createResponse(422, {}, { message: `Username or Full Name required` }));

  let statusCode = 500;
  let error = null;
  let addPhoneNumberToken = "";
  let user: UserModel = null;
  let response = null;

  async.series({
    validateRequestBody: (done) => {
      req.getValidationResult().then((result) => {
        if (!result.isEmpty()) {
          error = result.array().map(error => error.msg);
          statusCode = 422;
          done(error);
        } else {
          done();
        }
      });
    },
    validateUser: (done) => {
      User.findOne({ email: req.body.email }, (err, existingUser) => {
        if (err) {
          error = { message: "Something went wrong. Please try again." };
          return done(error);
        }
        if (existingUser) {
          statusCode = 422;
          error = { message: `Email address ${req.body.email} already registered.` };
          return done(error);
        }
        done();
      });
    },
    getVerificationCode: (done) => {
      crypto.randomBytes(16, (err, buf) => {
        addPhoneNumberToken = buf.toString("hex");
        done();
      });
    },
    createUser: (done) => {
      const newUser = new User({
        email: req.body.email.toLowerCase(),
        password: req.body.password,
        addPhoneNumberToken,
        firstname: req.body.firstname,
        lastname: req.body.lastname,
      });
      newUser.save((err) => {
        if (err) {
          error = { message: "Something went wrong. Please try again." };
          return done(error);
        }
        user = newUser;
        done();
      });
    },
    registerAuthy: (done) => {
      // Register this user if it's a new user
      authy.register_user(user.email, user.phone, user.countryCode,
        function (err, response) {
          if (err) {
            return done(err);
          }
          user.authy.authyId = response.user.id;
          user.save((err, doc) => {
            if (err || !doc) {
              error = { message: "Something went wrong. Please try again." };
              return done(error);
            }
            done();
          });
        });
    },
  }, (err) => {
    if (err) {
      return res.status(statusCode).json(createResponse(statusCode, {}, err));
    }

    response = {
      success: true,
      userId: user._id,
      addPhoneNumberToken,
    };
    return res.status(201).json(createResponse(201, response, {}));
  });
};

export const addPhoneNumber = (req: IRequest, res: Response, next: NextFunction) => {
  start = +new Date();
  req.assert("token").notEmpty().withMessage("Code must be needed.");
  req.assert("phone").notEmpty().withMessage("Phone number must be needed.");
  req.assert("countryCode").notEmpty().withMessage("Country code must be needed.");
  req.assert("userId").notEmpty().withMessage("UserID must be needed.");

  let statusCode = 500;
  let error = null;
  let phoneCode = "";
  let user: UserModel = null;
  let response = null;

  async.series({
    validateRequestBody: (done) => {
      req.getValidationResult().then((result) => {
        if (!result.isEmpty()) {
          error = result.array().map(error => error.msg);
          statusCode = 422;
          done(error);
        } else {
          done();
        }
      });
    },
    getUser: (done) => {
      User.findOne({
        addPhoneNumberToken: req.body.token,
      }).exec()
        .then(existingUser => {
          user = existingUser;
          done();
        })
        .catch(err => {
          statusCode = 500;
          done(err);
        })
        ;
    },
    getPhoneVerificationCode: (done) => {
      phoneCode = Math.floor(Math.random() * 9000 + 1000).toString();
      done();
    },
    updateUser: (done) => {
      user.phone = req.body.phone;
      user.phone_verified = false;
      user.countryCode = req.body.countryCode;
      user.verificationCode = phoneCode;
      user.save(err => {
        if (err) {
          statusCode = 500;
          done(err);
        }
        done();
      });
    },
    sendVerficiationSMS: (done) => {
      twilio.sendVerificationSMS(`+${user.countryCode}${user.phone}`, phoneCode)
        .then(res => done());
    },
  }, (err) => {
    if (err) {
      return res.status(statusCode).json(createResponse(statusCode, {}, err));
    }

    response = {
      success: true,
      userId: user._id,
      code: phoneCode,
    };
    return res.status(201).json(createResponse(201, response, {}));
  });
};

/**
 * Resend confirmation SMS
 */
export const resendConfirmationSMS = (req: IRequest, res: Response, next: NextFunction) => {
  start = +new Date();

  req.assert("phone", "not-valid").isEmpty();

  const errors = req.validationErrors();

  if (errors) {
    console.log("Valiation error during resending confirmation email: ", req.body, errors);
    return res.status(400).json(createResponse(400, {}, errors));
  }

  User.findOne({
    phone: req.body.phone,
  }).exec()
    .then((user: UserModel) => {
      if (!user) {
        // no user found
        return res.status(422).json(createResponse(422, {}, {
          "message": "No user found with email",
        }));
      }
      const countryCode = user.countryCode;
      const recipient = {
        phone: user.phone,
        name: user.firstname + " " + user.lastname,
        type: "to",
      };
    })
    .catch((err: Error) => {
      return res.status(500).json(createResponse(500, {}, err));
    });
};

/**
 * Verify user phone
 */
export const verifyPhone = (req: IRequest, res: Response, next: NextFunction) => {
  start = +new Date();

  req.assert("code", "required").notEmpty().withMessage("Verification code can not be empty");
  req.assert("userId", "required").notEmpty().withMessage("UserId code can not be empty");

  const errors = req.validationErrors();

  if (errors) {
    console.log("Validation error during phone number confirmation: ", req.body, errors);
    return res.status(422).json(createResponse(422, {}, errors));
  }

  User.findById(req.body.userId, (err, user) => {
    if (err) {
      return res.status(500).json(createResponse(500, {}, err));
    }
    if (!user) {
      // no user found
      return res.status(422).json(createResponse(422, {}, {
        "success": false,
        "message": "No user found with the code",
      }));
    }

    if (user.verificationCode !== req.body.code) {
      return res.status(500).json(createResponse(500, {}, {
        "success": false,
        "message": "Invalide verification code",
      }));
    }

    user.phone_verified = true;
    user.verificationCode = "";

    user.save((err, newUser) => {
      if (err) {
        return res.status(400).json(createResponse(400, {}, err));
      }

      return res.status(200).json(createResponse(200, {
        "success": true,
        "user": newUser,
      }, {}));
    });
  });
};

/**
 * Get active user profile
 */
export const getProfile = (req: IRequest, res: Response, next: NextFunction) => {
  const userId = req.params.userId;

  if (!userId) {
    return res.status(422).json(createResponse(422, {}, { message: "User ID is required" }));
  }

  try {
    globalHelper.checkUserId(req);
  } catch (err) {
    return res.status(500).json(createResponse(500, {}, err));
  }

  const errors = req.validationErrors();

  if (errors) {
    console.log(errors);
    return res.status(422).json(createResponse(422, {}, errors));
  }

  User.findById(userId, (err, user: any) => {
    if (err) {
      return next(err);
    }

    return res.status(200).json(createResponse(200, {
      email: user.email,
      username: user.username || user.firstname,
      firstname: user.firstname,
      lastname: user.lastname,
      phone: user.phone,
    }, {}));
  });
};

/**
 * Update user profile
 */
export const postUpdateProfile = (req: IRequest, res: Response, next: NextFunction) => {
  const userId = req.params.userId;

  if (!userId) {
    return res.status(422).json(createResponse(422, {}, { message: "User ID is required" }));
  }

  try {
    globalHelper.checkUserId(req);
  } catch (err) {
    return res.status(500).json(createResponse(500, {}, err));
  }

  if (!!req.body.email) {
    req.assert("email", "Please enter a valid email address.").isEmail();
    req.sanitize("email").normalizeEmail({ gmail_remove_dots: false });
  }


  const errors = req.validationErrors();

  if (errors) {
    console.log(errors);
    return res.status(422).json(createResponse(422, {}, errors));
  }

  let usernameOK = Promise.resolve();
  if (req.body.username) {
    req.sanitize("username").trim();
    usernameOK = User.findOne({
      "profile.username": req.body.username,
      _id: { $ne: userId }
    }).exec().then((user: UserModel) => {
      if (user)
        return Promise.reject(res.status(400).json(createResponse(400, {}, { message: "The username you have entered is already in use." })));
    });
  }

  usernameOK.then(() => {
    User.findById(userId, (err, user: any) => {
      if (err) {
        return next(err);
      }

      user.email = req.body.email || user.email;
      user.username = req.body.username || user.username;
      user.firstname = req.body.firstname || user.firstname;
      user.lastname = req.body.lastname || user.lastname;

      user.save((err: WriteError) => {
        if (err) {
          console.log(err);

          if (err.code === 11000) {
            return res.status(400).json(createResponse(400, {}, { message: "The email you have entered is already associated with another account." }));
          } else {
            return res.status(400).json(createResponse(400, {}, { message: "Error while saving user." }));
          }
        }

        return res.status(200).json(createResponse(200, {
          message: "Profile information has been updated.",
          email: user.email,
          username: user.username,
          firstname: user.firstname,
          lastname: user.lastname,
        }, {}));
      });
    });
  });
};

/**
 * Add friends from facebook.
 */
export const addFriendsFromFacebook = (req: IRequest, res: Response, next: NextFunction) => {
  start = +new Date();

  const userId = req.params.userId;

  if (!userId) {
    return res.status(422).json(createResponse(422, {}, { message: "User ID is required" }));
  }

  try {
    globalHelper.checkUserId(req);
  } catch (err) {
    return res.status(500).json(createResponse(500, {}, err));
  }

  let user: UserModel = null;
  const friendEmailList: Array<string> = [];
  const addedFriends: Array<Document> = [];
  const statusCode = 500;
  let error = null;

  async.series({
    getUser: (done) => {
      User.findById(userId, (err, existingUser) => {
        if (err) {
          error = { message: "Error getting user. Please try again." };
          return done(error);
        }
        user = existingUser;
        done();
      });
    },
    getFriendEmailList: (done) => {
      // Fetch friend email list from facebook.
      done();
    },
    addConnections: (done) => {
      async.each(friendEmailList, (friendEmail, processed) => {
        User.findOne({ email: friendEmail }, (err, existingUser) => {
          if (err || !existingUser) {
            return processed();
          }
          Connection.findOne({
            $or: [
              { firstUserId: user._id, secondUserId: existingUser._id },
              { firstUserId: existingUser._id, secondUserId: user._id },
            ]
          }, (err, connection) => {
            if (err || connection) {
              return processed();
            }
            const newConnection = new Connection({
              firstUserId: user._id,
              secondUserId: existingUser._id,
              status: 'accepted'
            });
            newConnection.save((err) => {
              if (!err) {
                addedFriends.push(newConnection);
              }
              processed();
            });
          });
        });
      }, err => {
        done();
      });
    },
  }, (err) => {
    if (error) {
      return res.status(statusCode).json(createResponse(statusCode, {}, error));
    }
    return res.status(201).json(createResponse(201, { addedFriends }, {}));
  });
};

/**
 * Update current password.
 */
export const postUpdatePassword = (req: IRequest, res: Response, next: NextFunction) => {
  const userId = req.params.userId;

  if (!userId) {
    return res.status(422).json(createResponse(422, {}, { message: "User ID is required" }));
  }

  try {
    globalHelper.checkUserId(req);
  } catch (err) {
    return res.status(500).json(createResponse(500, {}, err));
  }

  req.assert("confirmPassword", "not-match").equals(req.body.password).withMessage("Passwords don't match");
  req.assert("password", "unsafe").len({ min: 6 }).withMessage("Password too short");
  req.assert("password", "unsafe").matches(/[a-z]/).withMessage("Password must contain at least 1 lowercase character");
  req.assert("password", "unsafe").matches(/[A-Z]/).withMessage("Password must contain at least 1 uppercase character");
  req.assert("password", "unsafe").matches(/[0-9]/).withMessage("Password must contain at least 1 digit");

  const errors = req.validationErrors();

  if (errors) {
    return res.status(422).json(createResponse(422, {}, errors));
  }
  User.findById(userId, (err, user: UserModel) => {
    if (err) {
      return next(err);
    }
    user.comparePassword(req.body.oldPassword, (err: Error, isMatch: boolean) => {
      if (err)
        return next(err);

      if (!isMatch)
        return res.status(422).json(createResponse(422, {}, { message: "The password provided does not match the registered one!" }));

      user.password = req.body.password;
      user.save((err: WriteError) => {
        if (err) {
          return next(err);
        }
        return res.status(200).json(createResponse(200, { "success": true }, {}));
        // req.flash("success", { msg: "Password has been changed." });
        // return res.redirect("/account");
      });
    });
  });
};

/**
 * Create a random token, then the send user an email with a reset link.
 */
export const postForgot = (req: IRequest, res: Response, next: NextFunction) => {
  req.assert("email", "Please enter a valid email address.").isEmail();
  req.sanitize("email").normalizeEmail({ gmail_remove_dots: false });

  const errors = req.validationErrors();

  if (errors) {
    req.flash("errors", errors);
    return res.redirect("/forgot");
  }

  async.waterfall([
    function createRandomToken(done: Function) {
      crypto.randomBytes(16, (err, buf) => {
        const token = buf.toString("hex");
        done(err, token);
      });
    },
    function setRandomToken(token: string, done: Function) {
      User.findOne({ email: req.body.email }, (err, user: any) => {
        if (err) {
          return done(err);
        }

        if (!user) {
          req.flash("errors", { msg: "Account with that email address does not exist." });
          return res.redirect("/forgot");
        }

        user.passwordResetToken = token;
        user.passwordResetExpires = Date.now() + 3600000; // 1 hour

        user.save((err: WriteError) => {
          done(err, token, user);
        });
      });
    },
    function sendForgotPasswordSMS(token: string, user: UserModel, done: Function) {
      // Send forgot Password SMS code
    }
  ], (err) => {
    if (err) {
      return next(err);
    }
    return res.redirect("/forgot");
  });
};

/**
 * Find a user.
 */
export const find = (req: IRequest, res: Response, next: NextFunction) => {
  const userId = req.params.userId;

  if (!userId) {
    return res.status(422).json(createResponse(422, {}, { message: "User ID is required" }));
  }

  try {
    globalHelper.checkUserId(req);
  } catch (err) {
    return res.status(500).json(createResponse(500, {}, err));
  }

  start = +new Date();

  req.assert("search_content", "required").notEmpty().withMessage("Search context is required");

  let statusCode = 500;
  let error = null;
  let friends: Array<UserModel> = [];

  async.series({
    validateRequestBody: (done) => {
      req.getValidationResult().then((result) => {
        if (!result.isEmpty()) {
          error = result.array().map(error => error.msg);
          statusCode = 422;
          done(error);
        } else {
          done();
        }
      });
    },
    searchFriends: (done) => {
      const pattern = RegExp('.*' + req.params.search_content + '.*');
      User.find({
        $or: [
          { 'profile.username': "donatoyi" },
          { 'profile.firstname': { $regex: pattern } },
          { 'profile.lastname': { $regex: pattern } },
        ]
      }).select('_id profile').exec((err, searchResults) => {
        if (err) {
          error = { message: "Error searching. Please try again." };
          return done(error);
        }

        friends = searchResults;
        done();
      });
    },
  }, (err) => {
    if (error) {
      return res.status(statusCode).json(createResponse(statusCode, {}, error));
    }
    return res.status(200).json(createResponse(200, { success: true, friends }, {}));
  });
};

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

const isCountryCode = (isoCode: string) => {
  return true;
};

const createResponse = (responseCode: number, data: any, errors: any) => {
  const respnseModel: ResponseModel = {
    data: data,
    meta: getMetaData(),
    response: {
      code: responseCode,
      errors: {
        message: !!errors.length ? errors[0].msg : !!errors.message ? errors.message : ""
      },
      message: (responseCode < 400) ? "OK" : "Error"
    }
  };

  return respnseModel;
};
