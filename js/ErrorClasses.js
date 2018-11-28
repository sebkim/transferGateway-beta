class GetNullTrxError extends Error {
    constructor(message) {
        super(message);
        this.name = this.constructor.name;
    }
}
class FailGetConfirmationsError extends Error {
    constructor(message) {
        super(message)
        this.name = this.constructor.name;
    }
}
class TrxStatusFalseError extends Error {
    constructor(message) {
        super(message);
        this.name = this.constructor.name;
    }
}

module.exports = {
    GetNullTrxError,
    FailGetConfirmationsError,
    TrxStatusFalseError
}