import * as mongoose from "mongoose";

export type ConnectionModel = mongoose.Document & {
    firstUserId: number,
    firstUserName: string,
    secondUserId: number,
    secondUserName: string,
    status: string,

    createdAt: Date,
    updatedAt: Date,
};

const connectionSchema = new mongoose.Schema({
    firstUserId: mongoose.Schema.Types.ObjectId,
    firstUserName: String,
    secondUserId: mongoose.Schema.Types.ObjectId,
    secondUserName: String,
    status: String,
}, { timestamps: true });

export const Connection = mongoose.model("Connection", connectionSchema);
