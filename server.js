import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import helmet from "helmet";
import morgan from "morgan";
import Reviews from "./models/Reviews.js";
import Product from "./models/Product.js";
// import User from "./models/userSchema.js";
import { items, reviews } from "./data/data.js";
import productsRoutes from "./routes/product.js";
import reviewsRoutes from "./routes/reviews.js";
import Stripe from "stripe";


const stripe = new Stripe(`${process.env.STRIPE_KEY}`);

const env = dotenv.config({ path: "./.env" });
/* CONFIGURATIONS */
dotenv.config();
// connect to express app


const authenticateToken = async (req, res, next) => {
  console.log('Inside authenticateToken middleware');

  // Retrieve the token from the request headers
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1]; // Bearer <token>

  if (token == null) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Verify the token and extract the userId
    const decoded = jwt.verify(token, process.env.SECRET_KEY);

    // Fetch user details based on userId
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    req.userId = decoded.userId; // Attach userId to the request object
    next(); // Continue to the next middleware or route handler
  } catch (error) {
    return res.status(403).json({ error: "Invalid token" });
  }
};

const app = express();

//middleware
app.use(authenticateToken);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cors());
app.use(express.static("public"));
app.use(express.json());
app.use(helmet());
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));
app.use(morgan("common"));

/* ROUTES DB  */

app.use("/product", productsRoutes);
app.use("/reviews", reviewsRoutes);
// entry point for the  products and reviews routes

/* MONGOOSE SETUP */
mongoose
  .connect(process.env.MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(async () => {
    app.listen(process.env.MONGO_URL_PORT, () =>
      console.log(
        `Server connected to port ${process.env.MONGO_URL_PORT} and MongoDb`,
      ),
    );

    //     /* ADD DATA ONE TIME ONLY OR AS NEEDED */
    // await mongoose.connection.db.dropDatabase();

    // before seeding the db dropping the current db - avoiding dev duplication

    // Product.insertMany(items);
    // Reviews.insertMany(reviews);

    //inserting the kpis array of objects into the database
  })

  .catch((error) => {
    console.log("Unable to connect to Server and/or MongoDB", error);
  });

/* ROUTES AUTH  */

//POST REGISTER
app.post("/register", async (req, res) => {
  try {
    const { email, username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ email, username, password: hashedPassword });
    await newUser.save();
    res.status(201).json({ message: "User created successfully" });
  } catch (error) {
    res.status(500).json({ error: "Error signing up" });
  }
});



//GET Registered Users
app.get("/register", async (req, res) => {
  try {
    const users = await User.find();
    res.status(201).json(users);
  } catch (error) {
    res.status(500).json({ error: "Unable to get users" });
  }
});


// app.get('/user/email', authenticateToken, async (req, res) => {
//   try {
//      Fetch user details based on userId
//     const user = await User.findById(req.userId);

//     if (!user) {
//       return res.status(404).json({ error: 'User not found' });
//     }

//      Send user's email to the frontend
//     res.status(200).json({ email: user.email });

//   } catch (error) {
//     console.log('Error fetching user email:', error);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// });




app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: "Invalid Username" });
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid Password" });
    }
    const token = jwt.sign({ userId: user._id }, process.env.SECRET_KEY, {
      expiresIn: "1hr",
    });
    res.json({ message: "Login successful" });
  } catch (error) {
    res.status(500).json({ error: "Error logging in" });
  }
});

/* POST  STRIPE  */

app.post("/checkout", async (req, res) => {
  try {
    console.log(req.body);
    const items = req.body.items;
    let lineItems = [];
    items.forEach((item) => {
      lineItems.push({
        price: item.id,
        quantity: item.quantity,
      });
    });

    const session = await stripe.checkout.sessions.create({
      
      success_url: `${process.env.FE_URL}/success?session_id={SESSION_ID}`,
      cancel_url: `${process.env.FE_URL}/cancel`,
      line_items: lineItems,
      mode: "payment",
    });

    res.send(
      JSON.stringify({
        url: session.url,
        customer_email: session.email,
      }),
    );
  } catch (error) {
    console.error("Error processing checkout:", error);
    res.status(500).json({ error: "Error processing checkout" });
  }
});
