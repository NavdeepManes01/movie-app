require('dotenv').config();

const express = require('express');
const session = require('express-session');
const { check, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const path = require('path'); 

const app = express();

const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://dbUser:College0421@cluster0.dxht6mx.mongodb.net/movie-app';

mongoose.connect(mongoURI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.log('MongoDB error:', err.message));

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});

const User = mongoose.model('User', userSchema);

const movieSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
    year: { type: Number, required: true },
    genres: { type: [String], required: true },
    rating: { type: Number, required: true },
    duration: { type: Number, required: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
});

const Movie = mongoose.model('Movie', movieSchema);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET || 'development-secret',
    resave: false,
    saveUninitialized: false
}));

app.use((req, res, next) => {
    res.locals.user = req.session.user;
    next();
});

const requireLogin = (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    next();
};

const isMovieOwner = async (req, res, next) => {
    try {
        const movie = await Movie.findById(req.params.id);
        if (!movie) return res.redirect('/movies');
        if (movie.addedBy.toString() !== req.session.user._id) {
            return res.redirect('/movies');
        }
        req.movie = movie;
        next();
    } catch (error) {
        res.redirect('/movies');
    }
};

app.get('/', (req, res) => {
    res.render('index', { title: 'Home' });
});

app.get('/register', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.render('register', { title: 'Register', errors: [], old: {} });
});

app.post('/register', [
    check('username').notEmpty(),
    check('email').isEmail(),
    check('password').isLength({ min: 6 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.render('register', { title: 'Register', errors: errors.array(), old: req.body });
    }
    try {
        const { username, email, password } = req.body;
        
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.render('register', {
                title: 'Register',
                errors: [{ msg: 'Username or email already exists' }],
                old: req.body
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        const user = new User({ 
            username, 
            email, 
            password: hashedPassword 
        });
        
        await user.save();
        res.redirect('/login');
    } catch (error) {
        console.log('Registration error:', error.message);
        res.render('register', {
            title: 'Register',
            errors: [{ msg: 'Error: ' + error.message }],
            old: req.body
        });
    }
});

app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    res.render('login', { title: 'Login', errors: [], old: {} });
});

app.post('/login', [
    check('email').isEmail(),
    check('password').notEmpty()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.render('login', { title: 'Login', errors: errors.array(), old: req.body });
    }
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.render('login', {
                title: 'Login',
                errors: [{ msg: 'Invalid credentials' }],
                old: req.body
            });
        }
        
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.render('login', {
                title: 'Login',
                errors: [{ msg: 'Invalid credentials' }],
                old: req.body
            });
        }
        
        req.session.user = {
            _id: user._id,
            username: user.username,
            email: user.email
        };
        res.redirect('/dashboard');
    } catch (error) {
        res.render('login', {
            title: 'Login',
            errors: [{ msg: 'Error logging in' }],
            old: req.body
        });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get('/dashboard', requireLogin, async (req, res) => {
    const movies = await Movie.find({ addedBy: req.session.user._id });
    res.render('dashboard', { title: 'Dashboard', movies });
});

app.get('/movies', async (req, res) => {
    const movies = await Movie.find().populate('addedBy', 'username');
    res.render('movies', { title: 'Movies', movies });
});

app.get('/movies/add', requireLogin, (req, res) => {
    res.render('add-movie', { title: 'Add Movie', errors: [], old: {} });
});

app.post('/movies/add', requireLogin, [
    check('name').notEmpty(),
    check('description').notEmpty(),
    check('year').isInt({ min: 1888, max: new Date().getFullYear() + 5 }),
    check('genres').notEmpty(),
    check('rating').isFloat({ min: 0, max: 10 }),
    check('duration').isInt({ min: 1 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.render('add-movie', { title: 'Add Movie', errors: errors.array(), old: req.body });
    }
    try {
        const movie = new Movie({
            name: req.body.name,
            description: req.body.description,
            year: req.body.year,
            genres: Array.isArray(req.body.genres) ? req.body.genres : [req.body.genres],
            rating: req.body.rating,
            duration: req.body.duration,
            addedBy: req.session.user._id
        });
        await movie.save();
        res.redirect(`/movies/${movie._id}`);
    } catch (error) {
        res.render('add-movie', {
            title: 'Add Movie',
            errors: [{ msg: 'Error saving movie' }],
            old: req.body
        });
    }
});

app.get('/movies/:id', async (req, res) => {
    try {
        const movie = await Movie.findById(req.params.id).populate('addedBy', 'username');
        if (!movie) return res.redirect('/movies');
        const isOwner = req.session.user && movie.addedBy._id.toString() === req.session.user._id;
        res.render('movie-details', { title: movie.name, movie, isOwner });
    } catch (error) {
        res.redirect('/movies');
    }
});

app.get('/movies/:id/edit', requireLogin, isMovieOwner, (req, res) => {
    res.render('edit-movie', { title: 'Edit Movie', movie: req.movie, errors: [] });
});

app.post('/movies/:id/edit', requireLogin, isMovieOwner, [
    check('name').notEmpty(),
    check('description').notEmpty(),
    check('year').isInt({ min: 1888, max: new Date().getFullYear() + 5 }),
    check('genres').notEmpty(),
    check('rating').isFloat({ min: 0, max: 10 }),
    check('duration').isInt({ min: 1 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.render('edit-movie', { title: 'Edit Movie', movie: req.movie, errors: errors.array() });
    }
    try {
        await Movie.findByIdAndUpdate(req.params.id, {
            name: req.body.name,
            description: req.body.description,
            year: req.body.year,
            genres: Array.isArray(req.body.genres) ? req.body.genres : [req.body.genres],
            rating: req.body.rating,
            duration: req.body.duration
        });
        res.redirect(`/movies/${req.params.id}`);
    } catch (error) {
        res.render('edit-movie', {
            title: 'Edit Movie',
            movie: req.movie,
            errors: [{ msg: 'Error updating movie' }]
        });
    }
});

app.post('/movies/:id/delete', requireLogin, isMovieOwner, async (req, res) => {
    await Movie.findByIdAndDelete(req.params.id);
    res.redirect('/dashboard');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));