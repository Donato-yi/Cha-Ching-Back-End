import * as mongoose from "mongoose";

export type TransactionModel = mongoose.Document & {
    sender: number,
    sender_service: string,
    recipient: number,
    recipient_service: string,
    currency: string,
    amount: number,
    amount_usd: number,
};

const transactionSchema = new mongoose.Schema({
    sender: mongoose.Schema.Types.ObjectId,
    sender_service: mongoose.Schema.Types.ObjectId,
    recipient: mongoose.Schema.Types.ObjectId,
    recipient_service: mongoose.Schema.Types.ObjectId,
    currency: String,
    amount: Number,
    amount_usd: Number,
}, { timestamps: true });

export const Transaction = mongoose.model("Transaction", transactionSchema);
