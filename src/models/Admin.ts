import * as bcrypt from "bcrypt-nodejs";
import * as crypto from "crypto";
import * as mongoose from "mongoose";

export type AdminModel = mongoose.Document & {
  email: string,
  password: string,
  passwordResetToken: string,
  passwordResetExpires: Date,
  token: string,
  permissions: [string]

  comparePassword: (candidatePassword: string, cb: (err: Error, isMatch: boolean) => any) => void
};

const adminSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  password: String,
  passwordResetToken: String,
  passwordResetExpires: Date,
  token: String,
  permissions: [String]
}, { timestamps: true });

/**
 * Password hash middleware.
 */
adminSchema.pre("save", function save(next) {
  const user = this;
  if (!user.isModified("password")) { return next(); }
  bcrypt.genSalt(10, (err, salt) => {
    if (err) { return next(err); }
    bcrypt.hash(user['password'], salt, undefined, (err: mongoose.Error, hash) => {
      if (err) { return next(err); }
      user['password'] = hash;
      next();
    });
  });
});

adminSchema.methods.comparePassword = function (candidatePassword: string, cb: (err: any, isMatch: any) => {}) {
  bcrypt.compare(candidatePassword, this.password, (err: mongoose.Error, isMatch: boolean) => {
    cb(err, isMatch);
  });
};

const Admin: mongoose.Model<AdminModel> = mongoose.model("Admin", adminSchema);
export default Admin;
