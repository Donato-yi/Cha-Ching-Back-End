import * as bcrypt from "bcrypt-nodejs";
import * as crypto from "crypto";
import * as mongoose from "mongoose";

export type UserModel = mongoose.Document & {
  email: string,
  username: string,
  password: string,

  firstname: string,
  lastname: string,
  phone: string,
  countryCode: string,
  verificationCode: string,

  token: string,
  addPhoneNumberToken: string,

  passwordResetCode: string,
  passwordResetExpires: Date,

  services: {
    [service: string]: number,
  },

  authy: {
    authyId: number,
    verified: boolean,
  },

  phone_verified: boolean,
  email_verified: boolean,

  createdAt: Date,
  updatedAt: Date,

  comparePassword: (candidatePassword: string, cb: (err: any, isMatch: any) => any) => void,
  gravatar: (size: number) => string,
};

const userSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  username: String,
  password: String,

  firstname: String,
  lastname: String,
  phone: String,
  countryCode: String,
  verificationCode: String,

  token: String,
  addPhoneNumberToken: String,

  passwordResetCode: String,
  passwordResetExpires: Date,
  services: {
    type: Map,
    of: mongoose.Schema.Types.ObjectId,
  },
  authy: {
    authyId: Number,
    verified: Boolean,
  },

  phone_verified: Boolean,
  email_verified: Boolean,

}, { timestamps: true });

/**
 * Password hash middleware.
 */
userSchema.pre("save", function save(next) {
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

userSchema.methods.comparePassword = function (candidatePassword: string, cb: (err: any, isMatch: any) => {}) {
  bcrypt.compare(candidatePassword, this.password, (err: mongoose.Error, isMatch: boolean) => {
    cb(err, isMatch);
  });
};


/**
 * Helper method for getting user's gravatar.
 */
userSchema.methods.gravatar = function (size: number) {
  if (!size) {
    size = 200;
  }
  if (!this.email) {
    return `https://gravatar.com/avatar/?s=${size}&d=retro`;
  }
  const md5 = crypto.createHash("md5").update(this.email).digest("hex");
  return `https://gravatar.com/avatar/${md5}?s=${size}&d=retro`;
};

export const User: mongoose.Model<UserModel> = mongoose.model("User", userSchema);
