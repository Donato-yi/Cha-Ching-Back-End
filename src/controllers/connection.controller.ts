import * as async from "async";
import { Request, Response, NextFunction } from "express";

import * as globalHelper from "../helpers/global";

import { ResponseModel } from "../models/ResponseModel";
import { User, UserModel } from "../models/User";
import { Connection, ConnectionModel } from "../models/Connection";

let start: any;

interface IRequest extends Request {
  decodedToken: any;
  token: string;
}

/**
 * Invite a friend: make a connection between two users.
 */
export const inviteFriend = (req: IRequest, res: Response, next: NextFunction) => {
  const userId = req.params.userId;
  const friendId = req.params.friendId;

  if (!userId || !friendId) {
    return res.status(422).json(createResponse(422, {}, { message: "Your user ID and Friend user ID are required" }));
  }

  try {
    globalHelper.checkUserId(req);
  } catch (err) {
    return res.status(500).json(createResponse(500, {}, err));
  }

  start = +new Date();

  let statusCode = 500;
  let error = null;
  let me: UserModel = null;
  let friend: UserModel = null;

  async.series({
    getMe: (done) => {
      User.findById(req.params.userId, (err, existingUser) => {
        if (err) {
          error = { message: "Error getting IAM. Please try again." };
          return done(error);
        }
        if (!existingUser) {
          statusCode = 422;
          error = { message: "I does not exist." };
          return done(error);
        }
        me = existingUser;
        done();
      });
    },
    checkIfFriendExist: (done) => {
      User.findById(friendId, (err, existingUser) => {
        if (err) {
          error = { message: "Error getting friend. Please try again." };
          return done(error);
        }
        if (!existingUser) {
          statusCode = 422;
          error = { message: "Friend does not exist." };
          return done(error);
        }
        friend = existingUser;
        done();
      });
    },
    saveInvitation: (done) => {
      const newConnection = new Connection({
        firstUserId: userId,
        firstUserName: me.username,
        secondUserId: friendId,
        secondUserName: friend.username,
        status: 'pending'
      });
      newConnection.save((err) => {
        if (err) {
          error = { message: "Error saving invitation." };
          return done(error);
        }
        done();
      });
    },
  }, (err) => {
    if (error) {
      return res.status(statusCode).json(createResponse(statusCode, {}, error));
    }
    return res.status(200).json(createResponse(200, { success: true, message: 'Invitation Sent.' }, {}));
  });
};

/**
 * Get all contacts.
 */
export const getContacts = (req: IRequest, res: Response, next: NextFunction) => {
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

  const statusCode = 500;
  let error = null;
  const friendIds = [];
  let contacts = null;

  async.series({
    getFirstConnections: (done) => {
      Connection.find({ firstUserId: userId }).select('secondUserId').exec((err, ids) => {
        if (err) {
          error = { message: "Error getting first connections. Please try again." };
          return done(error);
        }

        friendIds.concat(ids);
        done();
      });
    },
    getSecondConnections: (done) => {
      Connection.find({ secondUserId: userId }).select('firstUserId').exec((err, ids) => {
        if (err) {
          error = { message: "Error getting second connections. Please try again." };
          return done(error);
        }
        friendIds.concat(ids);
        done();
      });
    },
    getFriends: (done) => {
      User.find({ _id: { $in: friendIds } }, (err, friends) => {
        if (err) {
          error = { message: "Error getting friends. Please try again." };
          return done(error);
        }
        contacts = friends;
        done();
      });
    },
  }, (err) => {
    if (error) {
      return res.status(statusCode).json(createResponse(statusCode, {}, error));
    }
    return res.status(200).json(createResponse(200, { contacts }, {}));
  });
};

/**
 * Get pending invitations.
 */
export const getPendingInvitations = (req: IRequest, res: Response, next: NextFunction) => {
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

  const statusCode = 500;
  let error = null;
  let invitationsSent = null;
  let invitationsReceived = null;

  async.series({
    getInvitationsSent: (done) => {
      Connection.find({ firstUserId: userId, status: 'pending' }, (err, pendingConnections) => {
        if (err) {
          error = { message: "Error getting pending invitations. Please try again." };
          return done(error);
        }

        invitationsSent = pendingConnections;
      });
    },
    getInvitationsReceived: (done) => {
      Connection.find({ secondUserId: userId, status: 'pending' }, (err, pendingConnections) => {
        if (err) {
          error = { message: "Error getting pending invitations. Please try again." };
          return done(error);
        }

        invitationsReceived = pendingConnections;
      });
    },
  }, (err) => {
    if (error) {
      return res.status(statusCode).json(createResponse(statusCode, {}, error));
    }
    return res.status(200).json(createResponse(200, { invitationsSent, invitationsReceived }, {}));
  });
};

/**
 * Accept pending invitations.
 */
export const acceptInvitation = (req: IRequest, res: Response, next: NextFunction) => {
  const userId = req.params.userId;
  const connectionId = req.params.connectionId;

  if (!userId) {
    return res.status(422).json(createResponse(422, {}, { message: "User ID is required" }));
  }

  if (!connectionId) {
    return res.status(422).json(createResponse(422, {}, { message: "Connection ID is required" }));
  }

  try {
    globalHelper.checkUserId(req);
  } catch (err) {
    return res.status(500).json(createResponse(500, {}, err));
  }

  start = +new Date();

  let statusCode;
  let error = null;

  async.series({
    acceptInvitation: (done) => {
      Connection.findById(connectionId, (err, pendingConnection: ConnectionModel) => {
        if (err) {
          statusCode = 500;
          error = { message: "Error getting pending invitation. Please try again." };
          return done(error);
        }

        pendingConnection.status = 'accepted';
        pendingConnection.save();
        done();
      });
    },
  }, (err) => {
    if (error) {
      return res.status(statusCode).json(createResponse(statusCode, {}, error));
    }
    return res.status(200).json(createResponse(200, { success: true }, {}));
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
