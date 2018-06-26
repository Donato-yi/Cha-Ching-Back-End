const countries = require("countries-list");

class Helpers {
  constructor() {
  }

  /**
   * Method for get country code via phone code.
   *
   * @param {number} countryCode.
   * @returns {String} - country code.
   */
  getCountryCode(countryCode: number): any {
    if (!countryCode) {
      return new Error("Phone code is required");
    }

    return Object.keys(countries.countries).find((country) => {
      return Number(countries.countries[country].phone) == countryCode;
    });
  }
}

module.exports = () => {
  return new Helpers();
};
