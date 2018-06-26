import { Request, Response, NextFunction } from "express";

interface IRequest extends Request {
  decodedToken: any;
  token: string;
}

export const checkUserId = (req: IRequest) => {
  if ((req.params.userId && req.params.userId != req.decodedToken.id) ||
      (req.body.userId && req.body.userId != req.decodedToken.id)) {
    throw new Error("Request rejected: User ID does not match token!");
  }

  return true;
};
