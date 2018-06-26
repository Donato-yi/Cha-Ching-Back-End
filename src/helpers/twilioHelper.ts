const twilioNumber = process.env.TWILIO_NUMBER;
const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_TOKEN;

const client = require('twilio')(accountSid, authToken);

export const sendVerificationSMS = (phone: string, code: string) => {
  return new Promise((resolve, reject) => {
    client.messages
      .create({
        body: `Welcome to Cha Ching, The verification code is ${code}.`,
        from: twilioNumber,
        to: phone,
      })
      .then(message => resolve(message))
      .catch(err => reject(err))
      ;
  });
};

// Validate E164 format
export const validE164 = num => {
  return /^\+?[1-9]\d{1,14}$/.test(num);
};