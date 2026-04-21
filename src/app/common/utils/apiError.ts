class apiError extends Error {
    statusCode: number;
    isOperational: boolean;
    data: unknown;

    constructor(statusCode: number, message: string, error: unknown = null){
        super(message)
        this.statusCode = statusCode
        this.isOperational = true
        this.data = error
        if(Error.captureStackTrace){
            Error.captureStackTrace(this, this.constructor)
        }
    }

    static badRequest(message = "Bad request", error: unknown = null){
        return new apiError(400, message, error)
    }

    static unauthorized(message = "Unauthorized", error: unknown = null){
        return new apiError(401, message, error)
    }

    static conflict(message = "Conflict", error: unknown = null){
        return new apiError(409, message, error)
    }

    static forbidden(message = "forbidden", error: unknown = null){
        return new apiError(403, message, error)
    }

    static notFound(message = "not found", error: unknown = null){
        return new apiError(404, message, error)
    }
}

export default apiError