import passport from "passport";
import {
  registerUser,
  findUserById,
  findUserByEmail,
  updateUserPassword,
  requestPasswordReset,
  resetPassword, 
  validateResetToken,
  mDocumentUpload
} from "../services/user.service.js";

export const register = async (req, res, next) => {
  //Elimina usuarios que se hayan creado con email:null para evitar conflictos
  await userModel.deleteMany({ email: null });

  passport.authenticate("register", async (err, user, info) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      return res.redirect("/failregister");
    }
    try {
      const newUser = await registerUser(user);
      req.login(newUser, (err) =>{
        if (err) {
          return res.status(500).send('Error al inciar sesion despues del registro')
        }
        req.user = {
        first_name: newUser.first_name,
        last_name: newUser.last_name,
        email: newUser.email,
        age: newUser.age,
        role: newUser.role,
        cart: newUser.cartId,
      };
      res.redirect('/login')
      }) 
    }catch (err) {
      console.error('Error durante el registro:', err)
      res.status(500).send("Error al registrar al usuario");
    }
  })(req, res, next);
};

export const login = async (req, res, next) => {
  passport.authenticate("login", async (err, user, info) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      return res.redirect("/faillogin");
    }
    try {
      
      req.login(user, async (err) => {
        if(err) {
          return res.status(500).send('Error al iniciar sesion.')
        }
      })
      const foundUser = await findUserById(user._id);
      req.user = {
        first_name: foundUser.first_name,
        last_name: foundUser.last_name,
        email: foundUser.email,
        age: foundUser.age,
        role: foundUser.role,
        cart: foundUser.cartId,
      };
      res.redirect("/api/products");
    } catch (err) {
      res.status(500).send("Error al iniciar sesión");
    }
  })(req, res, next);
};

export const failRegister = (req, res) => {
  res.send({ error: "Fallo" });
};

export const failLogin = (req, res) => {
  res.send({ error: "Login fallido" });
};

export const logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).send("Error al cerrar sesión");
    }
    res.redirect("/login");
  });
};

export const restorePassword = async (req, res) => {
  const { email, newPassword } = req.body;
  if (!email || !newPassword)
    return res.status(400).send({ status: "error", error: "Datos incompletos" });

  try {
    const user = await findUserByEmail(email);
    if (!user) return res.status(400).send("Usuario no encontrado");

    await updateUserPassword(user, newPassword);
    res.send("Contraseña actualizada correctamente");
  } catch (error) {
    res.status(500).send("Error al restaurar la contraseña");
  }
};

export const githubAuth = (req, res) => {};

export const githubCallback = (req, res) => {
  if (!req.user) {
    return res.redirect("/");
  }
  res.redirect("/");
};

export const editProfile = async (req, res) => {
  const { first_name, last_name, email, age, currentPassword, newPassword } = req.body;

  if (!first_name || !last_name || !email || !age) {
    return res.status(400).send("Todos los campos excepto la contraseña son requeridos.");
  }

  try {
    const user = req.user;

    if (!user) {
      return res.status(404).send("Usuario no encontrado");
    }
    if (email !== user.email) {
      const existingUser = await findUserByEmail(email);
      if (existingUser) {
        return res.status(400).send("El email ya está registrado");
      }
    }

    user.first_name = first_name;
    user.last_name = last_name;
    user.email = email;
    user.age = age;

    if (newPassword) {
      if (!currentPassword || !isValidPassword(user, currentPassword)) {
        return res.status(400).send("Contraseña actual incorrecta");
      }
      user.password = createHash(newPassword);
    }

    await user.save();
    req.user = user;

    res.redirect("/");
  } catch (error) {
    res.status(500).send(`Error al completar el perfil: ${error.message}`);
  }
};

export const renderEditProfile = async (req, res) => {
  try {
    const user = await findUserById(req.user._id);
    if (!user) {
      return res.status(404).send("Usuario no encontrado");
    }
    res.render('editprofile', { user });
  } catch (error) {
    res.status(500).send(`Error al cargar el perfil para editar: ${error.message}`);
  }
};


export const reqPassReset = async (req, res) => {
  const { email } = req.body

  try {
    await requestPasswordReset(email)
    res.redirect("/api/sessions/passwordResetSent")
  } catch (error) {
    res.status(500).send(error.message)
  }
}

export const resPassword = async (req, res) => {
  const { token } = req.params
  const { password, confirmPassword} = req.body

  if(password !== confirmPassword) {
    return res.status(400).send("Las contraseñas deben conincidir.")
  }

  try {
    await resetPassword(token, password)
    res.render("passwordUpdated")
  } catch (error) {
    res.status(500).send(error.message)
  }
}

export const renderPasswordResetForm = async (req, res) => {
  const { token } = req.params;

  try {
    const isValid = await validateResetToken(token);
    if (!isValid) {
      return res.status(400).send({ status: "error", error: "Enlace de restablecimiento inválido o expirado" });
    }

    res.render("resetPass", { token });
  } catch (error) {
    console.error("Error validando el token de restablecimiento:", error);
    res.status(500).send({ status: "error", error: "Error interno del servidor" });
  }
};

//////////////////////////////////
export const uploadDocuments = async (req, res) => {
  try {
    const userId =  req.params.uid
    const files = req.files

    const result = await mDocumentUpload(userId, files)

    res.status(200).json(result)
  } catch (error) {
    res.status(500).json({ message: 'Error al subir los documentos', error })  
  }
}

export const changeUserRole = async (req, res) => {
  const { uid } = req.params;
  try {
    const user = await findUserById(uid);

    if (!user) {
      return res.status(404).send("Usuario no encontrado");
    }

    if (req.files.length < 3) {
    return res.render('uploadDocuments', { user, errorMessage: "Debes subir los tres documentos requeridos." });
    }

    user.documents = req.files.map(file => ({
      name: file.originalname,
      reference: file.path,
    }));

    if (user.documents.length >= 3) {
      user.role = 'premium';
    }

    await user.save();

    res.redirect('/profile');
  } catch (error) {
    res.status(500).send("Error al cambiar el rol del usuario");
  }
};

export const renderUploadDocuments = async (req, res) => {
  const { uid } = req.params
  try {
    const user = await findUserById(uid)

    if(!user) {
      return res.status(404).send('Usuario no encontrado')
    }
    res.render('uploadDocuments', { user })
  } catch (error) {
    res.status(500).send("Error al subir los archivos.")
  }
}
