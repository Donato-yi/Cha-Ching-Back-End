import * as mongoose from "mongoose";

export type CurrencyModel = mongoose.Document & {
    label: string,
    symbol: string,
    price_usd: string,
    last_updated: number,
    rate_hour: number,
    rate_day: number,
    rate_week: number,
    rate_month: number,
    rate_year: number,
};

const currencySchema = new mongoose.Schema({
    label: String,
    symbol: String,
    price_usd: Number,
    last_updated: String,
    rate_hour: Number,
    rate_day: Number,
    rate_week: Number,
    rate_month: Number,
    rate_year: Number,
}, { timestamps: true });

export const Currency = mongoose.model("Currency", currencySchema);
