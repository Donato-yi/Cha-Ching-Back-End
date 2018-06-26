import * as mongoose from "mongoose";

export type ExchangeServiceModel = mongoose.Document & {
  label: string,
  userId: number,
  wallets: {
    [coin: string]: number,
  },

  api_key: string,
  api_secret: string,

  createdAt: Date,
  updatedAt: Date,
};

const exchangeServiceSchema = new mongoose.Schema({
  label: String,
  userId: mongoose.Schema.Types.ObjectId,
  wallets: {
    type: Map,
    of: mongoose.Schema.Types.ObjectId,
  },

  api_key: String,
  api_secret: String,
}, { timestamps: true });

export const ExchangeService: mongoose.Model<ExchangeServiceModel> = mongoose.model("ExchangeService", exchangeServiceSchema);
