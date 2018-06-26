export type ResponseModel = {
  data: any,
  meta: {
    version: string,
    received: number,
    executed: number
  },
  response: {
    code: number,
    message: string
    errors: any
  }
};
