import express from "express";
import { Server } from "socket.io";
import handlebars from "express-handlebars";
import dotenv from "dotenv"
import connectDB from "./config/db.js";
import ProductManager from "./dao/manager/productManager.js";
import indexRouter from "./routes/index.router.js";
import productsRouter from "./routes/products.router.js";
import cartsRouter from "./routes/carts.router.js";
import path from 'path'
import  {__dirname}  from "./utils.js";

//Cargar variables de entorno y conectar a MongoDB
console.log(process.env.MONGO_URL)
dotenv.config()
connectDB()

const app = express();
const PORT = 8080;

const httpServer = app.listen(PORT, () =>
  console.log(`Server running on port ${PORT}`)
);

const socketServer = new Server(httpServer);
const productManager = new ProductManager();

// Set up handlebars engine
app.use(express.static(__dirname + "/public"));
app.engine("handlebars", handlebars.engine());
app.set("view engine", "handlebars");
app.set("views", __dirname + "/views");

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public")));

// Routes
app.use("/", indexRouter);
app.use("/api/products", productsRouter);
app.use("/api/carts", cartsRouter);

// Socket.io
let messages = []

socketServer.on("connection", socket => {
  console.log("Cliente conectado");
  productManager.uploadProducts().then((products) => {
    socket.emit("products", products);
  });
  socket.on("newProduct", (product) => {
    productManager
      .addProduct(
        product.title,
        product.description,
        product.code,
        product.price,
        product.status,
        product.stock,
        product.category,
        product.thumbnails
      )
      .then(() => {
        return productManager.uploadProducts();
      })
      .then((products) => {
        socket.emit("products", products);
        socket.emit("response", "Producto agregado correctamente");
      })
      .catch((error) =>
        socket.emit(
          "response",
          "Error al agregar el producto deseado" + error.message
        )
      );
  });
  socket.on("delProduct", (pid) => {
    productManager
      .delProduct(pid)
      .then(() => {
        return productManager.delProduct();
      })
      .then((products) => {
        socket.emit("products", products);
        socket.emit("responseDel", "Producto borrado correctamente");
      })
      .catch((error) =>
        socket.emit(
          "responseDel",
          "Error al borrar el producto deseado" + error.message
        )
      );
  });
  socket.on("message", data => {
    messages.push(data)
    socketServer.emit("messageLogs", messages)
  })
});

export default app;