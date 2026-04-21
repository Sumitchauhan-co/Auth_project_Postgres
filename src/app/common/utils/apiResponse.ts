import type {Response} from "express"

class apiResponse {
    static ok(res: Response, message: string, data = {}) {
        return res.status(200).json({
            success: true,
            message,
            data,
        });
    }

    static created(res: Response, message: string, data = {}) {
        return res.status(201).json({
            success: true,
            message,
            data,
        });
    }
}

export default apiResponse;