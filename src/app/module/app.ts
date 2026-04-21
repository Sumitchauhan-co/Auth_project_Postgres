import express from "express";
import authRouter from "./auth/auth.route.js";
import cookieParser from "cookie-parser"

// create app

const app = express()

// middlewares

app.use(express.json())

app.use(cookieParser())

// routes

app.use('/api', authRouter)

export default app