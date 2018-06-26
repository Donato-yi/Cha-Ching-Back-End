import * as mongoose from "mongoose";
import * as acl from "acl";
import * as mongodb from "mongodb";


export class AclHelperModel {
  roles: any;
  allows: AllowPermission[];
}

export class AllowPermission {
  resources: string;
  permissions: any;
}

export class AclHelper {

  assignRole = (userid: string, role: string, done: Function, error: Function) => {
    mongodb.MongoClient.connect(process.env.MONGODB_URI, function(errorRes: any, db: any) {
      let new_acl: any = "";
      new_acl = new acl(new acl.mongodbBackend(db));
      new_acl.addUserRoles(userid, role, function(err: any) {
        if (err) {
          error(err);
        } else {
          done({ Message: "Role Added" });
        }
      });
    });
  }

  getPermissions = (userid: string, resources: any, done: Function, error: Function) => {
    mongodb.MongoClient.connect(process.env.MONGODB_URI, function(errorRes: any, db: any) {
      let new_acl: any = "";
      new_acl = new acl(new acl.mongodbBackend(db));
      new_acl.allowedPermissions(userid, resources, function(err: any, permissions: any) {
        if (err) {
          error(err);
        } else {
          console.log(permissions);
          done(permissions);
        }
      });
    });
  }
  allowed = (userid: string, resources: any, method: any, done: Function, error: Function) => {
    mongoose.connect(process.env.MONGODB_URI || process.env.MONGOLAB_URI);
    mongoose.connection.on("error", () => {
      console.log("MongoDB connection error. Please make sure MongoDB is running.");
      process.exit();
    });
    mongodb.MongoClient.connect(process.env.MONGODB_URI, function(errorRes: any, db: any) {
      let new_acl: any = "";
      new_acl = new acl(new acl.mongodbBackend(db));
      new_acl.isAllowed(userid, resources, method, function(err: any, res: any) {
        if (err) {
          error(err);
        } else {
          console.log(res);
          done(res);
        }
      });
    });
  }

  isAllowed = function(req: any, res: any, done: Function, error: Function) {
    const roles = (req.user) ? req.user.roles : ["guest"];
    console.log(req.user);

    mongodb.MongoClient.connect(process.env.MONGODB_URI, function(errorRes: any, db: any) {
      let new_acl: any = "";
      new_acl = new acl(new acl.mongodbBackend(db));
      new_acl.areAnyRolesAllowed(roles, req.route.path, req.method.toLowerCase(), function(err: any, isAllowed: any) {
        if (err) {
          // An authorization error occurred.
          error(err);
        } else {
          if (isAllowed) {
            // Access granted! Invoke next middleware
            done(isAllowed);
          } else {
            error(err);
          }
        }
      });
    });
  };
}
