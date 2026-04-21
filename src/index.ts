import app from './app/module/app.js';
import 'dotenv/config';

const PORT = process.env.PORT || 3000;

// start server

app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
