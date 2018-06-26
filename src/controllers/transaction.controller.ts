import * as async from "async";
import { Request, Response, NextFunction } from "express";

import binance, { Binance } from 'binance-api-node';
import * as coinbase from 'coinbase';

import * as globalHelper from "../helpers/global";

import { ResponseModel } from "../models/ResponseModel";
import { User, UserModel } from "../models/User";
import { Wallet, WalletModel } from "../models/Wallet";
import { ExchangeService, ExchangeServiceModel } from "../models/ExchangeService";
import { Transaction, TransactionModel } from "../models/Transaction";
import { Document } from "mongoose";

let start: any;

interface IRequest extends Request {
  decodedToken: any;
  token: string;
}

/**
 * Make a transfer.
 */
export const transfer = (req: IRequest, res: Response, next: NextFunction) => {
  start = +new Date();

  req.assert("sender", "required").notEmpty().withMessage("Sender is required");
  req.assert("recipient", "required").notEmpty().withMessage("Recipient is required");
  req.assert("sender_service", "required").notEmpty().withMessage("Sender ExchangeService is required");
  req.assert("recipient_service", "required").notEmpty().withMessage("Recipient ExchangeService is required");
  req.assert("currency", "required").notEmpty().withMessage("Currency is required");
  req.assert("amount", "required").notEmpty().withMessage("Amount is required").isNumeric().withMessage("Amount must be numeric");

  let statusCode = 500;
  let error = null;
  let sender: UserModel = null;
  let sender_wallet: WalletModel = null;
  let sender_service: ExchangeServiceModel = null;
  let recipeint: UserModel = null;
  let recipient_wallet: WalletModel = null;
  let recipient_service: ExchangeServiceModel = null;
  const response = { success: true };

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
    getSender: (done) => {
      User.findById( req.body.sender , (err, existingUser) => {
        if (err) {
          error = { message: "Something went wrong. Please try again." };
          return done(error);
        }
        if (!existingUser) {
          statusCode = 422;
          error = { message: `Sender does not exist.` };
          return done(error);
        }
        sender = existingUser;
        done();
      });
    },
    getRecipient: (done) => {
      User.findById( req.body.recipeint , (err, existingUser) => {
        if (err) {
          error = { message: "Something went wrong. Please try again." };
          return done(error);
        }
        if (!existingUser) {
          statusCode = 422;
          error = { message: `Recipient does not exist.` };
          return done(error);
        }
        recipeint = existingUser;
        done();      });
    },
    validateSender: (done) => {
      ExchangeService.findById( sender.services[ req.body.sender_service ], (err, exchangeService) => {
        if (err) {
          error = { message: `Sender does not have ${req.body.sender_service} service.` };
          return done(error);
        }
        sender_service = exchangeService;
        Wallet.findById( exchangeService.wallets[ req.body.currency ], (err, wallet) => {
          if (err) {
            error = { message: `Sender does not have ${req.body.currency} wallet.` };
            return done(error);
          }
          if (wallet.balance < req.body.amount) {
            error = { message: "Sender does not have enough balance." };
            return done(error);
          }
          sender_wallet = wallet;
          done();
        });
      });
    },
    validateRecipient: (done) => {
      ExchangeService.findById( recipeint.services[ req.body.recipient_service ], (err, exchangeService) => {
        if (err) {
          error = { message: `Recipient does not have ${req.body.recipient_service} service.` };
          return done(error);
        }
        recipient_service = exchangeService;
        Wallet.findById( exchangeService.wallets[ req.body.currency ], (err, wallet) => {
          if (err) {
            error = { message: `Sender does not have ${req.body.currency} wallet.` };
            return done(error);
          }
          recipient_wallet = wallet;
          done();
        });
      });
    },
    transfer: (done) => {
      const newTransaction = new Transaction({
        sender: sender._id,
        sender_service: sender_service._id,
        recipeint: recipeint._id,
        recipient_service: recipient_service._id,
        currency: req.body.currency,
        amount: req.body.amount,
      });
      switch ( req.body.sender_service ) {
        case 'binance':
          const binanceClient: any = binance({
            apiKey: sender_service.api_key,
            apiSecret: sender_service.api_secret,
          });

          binanceClient.withdraw({
            asset: req.body.currency,
            amount: req.body.amount,
            address: recipient_wallet.address,
          }).then( res => {
            if (!res.success) {
              error = { message: res.message };
              return done(error);
            }
            newTransaction.save((err) => {
              if (err) {
                error = { message: "Error saving transaction history" };
                return done(error);
              }
              done();
            });
          });
          break;
        case 'coinbase':
          const coinbaseClient = new coinbase.Client({
            apiKey: sender_service.api_key,
            apiSecret: sender_service.api_secret,
          });

          coinbaseClient.getAccounts( {}, (err, accounts) => {
            accounts.find( account => account.currency === req.body.currency )
              .sendMoney({
                type: 'send',
                to: recipient_wallet.address,
                amount: req.body.amount,
                currency: req.body.currency,
                description: 'Transaction permitted by Cha Ching.',
              }, (err, transaction) => {
                if (err) {
                  error = { message: err.message };
                  return done(error);
                }
                transaction.complete( (err, result) => {
                  if (err) {
                    error = { message: err.message };
                    return done(error);
                  }
                  newTransaction.save((err) => {
                    if (err) {
                      error = { message: "Error saving transaction history" };
                      return done(error);
                    }
                    done();
                  });
                });
              });
          });
          break;
        default:
          break;
      }
    },
  }, (err) => {
    if (error) {
      return res.status(statusCode).json(createResponse(statusCode, {}, error));
    }
    return res.status(201).json(createResponse(201, response, {}));
  });
};

/**
 * Get History.
 */
export const history = (req: IRequest, res: Response, next: NextFunction) => {
  const userId = req.params.userId;

  if (!userId) {
    return res.status(422).json(createResponse(422, {}, { message: "User ID is required" }));
  }

  try {
    globalHelper.checkUserId(req);
  } catch (err) {
    return res.status(500).json(createResponse(500, {}, err));
  }

  let statusCode = 500;
  let error = null;
  let user: UserModel = null;
  let transactionsSent: Array<Document> = [];
  let transactionsReceived: Array<Document> = [];

  async.series({
    getUser: (done) => {
      User.findById( req.body.sender , (err, existingUser) => {
        if (err) {
          error = { message: "Error getting user. Please try again." };
          return done(error);
        }
        if (!existingUser) {
          statusCode = 422;
          error = { message: `User does not exist.` };
          return done(error);
        }
        user = existingUser;
        done();
      });
    },
    getTransactionsSent: (done) => {
      Transaction.find( { sender: user._id } , (err, transactions) => {
        if (err) {
          error = { message: "Error getting transactions. Please try again." };
          return done(error);
        }
        transactionsSent = transactions;
        done();
      });
    },
    getTransactionsReceived: (done) => {
      Transaction.find( { recipient: user._id } , (err, transactions) => {
        if (err) {
          error = { message: "Error getting transactions. Please try again." };
          return done(error);
        }
        transactionsReceived = transactions;
        done();
      });
    },
  }, (err) => {
    if (error) {
      return res.status(statusCode).json(createResponse(statusCode, {}, error));
    }
    return res.status(201).json(createResponse(201, { transactionsSent, transactionsReceived }, {}));
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
