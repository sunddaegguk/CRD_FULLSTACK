import express from 'express';
import ejs from 'ejs';
import bodyParser from 'body-parser';
import mongoose from 'mongoose';
import methodOverride from 'method-override';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import passportLocalMongoose from 'passport-local-mongoose';
import session from 'express-session';
import path from 'path';
import moment from 'moment';
import { stripHtml } from 'string-strip-html';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import flash from 'connect-flash';
import { MemoryStore } from 'express-session';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MemoryStoreInstance = new MemoryStore({
  checkPeriod: 86400000, // prune expired entries every 24h
});

// Middleware to set req.user and moment in res.locals
app.use((req, res, next) => {
  // Check if the user is authenticated
  if (req.user) {
    // If authenticated, assign the user to req.user
    req.user = req.user || null;
  } else {
    // If not authenticated, set req.user to null
    req.user = null;
  }

  app.use(
    session({
      secret: 'your-secret-key',
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 24 * 60 * 60 * 1000 }, // 24 hours, adjust as needed
    })
  );
  //자동 로그아웃 방지

  // Set moment and stripHtml in res.locals
  res.locals.moment = moment; // Use `moment` directly
  res.locals.stripHtml = stripHtml;

  next();
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(methodOverride('_method'));
app.use(flash());

// Authentication config
app.use(
  session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    store: MemoryStoreInstance, // Use the created MemoryStoreInstance
  })
);

// Connect to MongoDB
mongoose
  .connect(
    'mongodb+srv://ssitek22:123WNS@dec23.wj628u1.mongodb.net/board-dec23',
    {}
  )
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch((error) => {
    console.error('Error connecting to MongoDB:', error);
  });

// User schema
const userSchema = new mongoose.Schema({
  username: String,
  password: String,
});
console.log(userSchema);

userSchema.plugin(passportLocalMongoose);
const User = mongoose.model('User', userSchema);
console.log(User);

passport.use(User.createStrategy());
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findById(id)
    .then((user) => {
      done(null, user);
    })
    .catch((err) => {
      done(err, null);
    });
});

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Comments schema
const commentSchema = new mongoose.Schema({
  author: String,
  comment: String,
});
console.log(commentSchema);

const Comment = mongoose.model('Comment', commentSchema);
console.log(Comment);

const postSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  image: { type: String, required: true },
  tag: { type: String, required: true },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  comments: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Comment',
    },
  ],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Middleware to update `updatedAt` on every update
postSchema.pre('findOneAndUpdate', function (next) {
  this.set({ updatedAt: new Date() });
  next();
});

const Post = mongoose.model('Post', postSchema);
console.log(Post);

// Homepage route
app.get('/', async (req, res) => {
  try {
    const posts = await Post.find({}).sort({ createdAt: 'desc' });
    res.render('home', { posts: posts, user: req.user });
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

// Handle the request and render the page for creating a new blog post
app.get('/blogs/new', isLoggedIn, (req, res) => {
  res.render('new-post', { user: req.user });
});

// Show registration form
app.get('/register', (req, res) => {
  res.render('register.ejs', { user: req.user });
});

//bulletin board
// Mocked posts data
const posts = [
  { title: 'Post 1', content: 'Content 1' },
  { title: 'Post 2', content: 'Content 2' },
  // Add more posts as needed
];
// Your route logic to render bulletin-board
app.get('/bulletin', (req, res) => {
  res.render('bulletin');
});

//bulletin board end

// Handle registration form submission
app.post('/register', async (req, res) => {
  try {
    await User.register(
      new User({ username: req.body.username }),
      req.body.password
    );
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send('Registration failed. Please try again.');
  }
});

// Handle form submission for creating a new blog post
app.post('/blogs/new', isLoggedIn, async (req, res) => {
  const { title, tag, image, description } = req.body;
  const newPost = new Post({
    title,
    tag,
    image,
    description,
  });

  try {
    await newPost.save();
    res.redirect('/');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

// Delete a single post
app.delete('/blogs/:id', async (req, res, next) => {
  try {
    const result = await Post.findByIdAndDelete(req.params.id);

    if (!result) {
      // If the post was not found, handle the situation
      console.log('Post not found');
      return res.status(404).send('Post not found');
    }

    // If the post was successfully deleted, redirect
    res.redirect('/');
  } catch (err) {
    // Handle errors
    console.error(err);
    next(err);
  }
});

// Add a route to handle individual blog posts
app.get('/posts/:postId', async (req, res) => {
  try {
    const postId = req.params.postId;
    console.log(postId);

    // Add .populate('comments') to fetch associated comments
    const post = await Post.findById(postId).populate('comments').exec().then();
    console.log('Post After Saving Comment:', post);
    console.log(post.comments);
    if (!post) {
      // If the post is not found, return a 404 Not Found response
      return res.status(404).send('Post not found');
    }

    // Move these lines inside the route where post is defined
    const formattedCreatedAt = moment(post.createdAt).format(
      'MMMM Do YYYY, h:mm:ss a'
    );
    const formattedUpdatedAt = moment(post.updatedAt).format(
      'MMMM Do YYYY, h:mm:ss a'
    );

    // Render the post details page with the retrieved post
    console.log('Post Object:', post);
    console.log('Post Comments:', post.comments);
    res.render('post', {
      post: post,
      user: req.user,
      formattedCreatedAt,
      formattedUpdatedAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

// Render the edit form
app.get('/posts/:id/edit', isLoggedIn, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).exec();
    console.log(post);

    if (!post) {
      req.flash('error', 'Post not found');
      return res.status(404).redirect('/'); // Redirect to home or handle appropriately
    }

    // Render the edit form with the post data
    res.render('edit-post', { user: req.user, post });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Internal Server Error');
    res.status(500).redirect('/'); // Redirect to home or handle appropriately
  }
});

// Handle form submission for editing a post
app.post('/blogs/:id', isLoggedIn, async (req, res) => {
  try {
    const { title, tag, image, description } = req.body;
    const updatedPost = {
      title,
      tag,
      image,
      description,
    };

    // Perform the database update or any other asynchronous operation here
    const result = await Post.findByIdAndUpdate(req.params.id, updatedPost, {
      new: true,
      runValidators: true,
    });

    // Handle the result and redirect as needed
    if (!result) {
      req.flash('error', 'Post not found');
      return res.status(404).redirect('/'); // Redirect to home or handle appropriately
    }

    req.flash('success', 'uccessfully updated');
    res.redirect(`/posts/${result._id}`);
  } catch (error) {
    // Handle errors
    console.error(error);
    req.flash('error', 'Internal Server Error');
    res.status(500).redirect('/'); // Redirect to home or handle appropriately
  }
});
// Edit a single post - Handle form submission
app.put('/blogs/:id', isLoggedIn, async (req, res) => {
  try {
    const { title, tag, image, description } = req.body;
    const updatedPost = {
      title,
      tag,
      image,
      description,
    };

    const result = await Post.findByIdAndUpdate(req.params.id, updatedPost, {
      new: true,
      runValidators: true,
    }).exec();

    // Handle result and redirect as needed
    if (!result) {
      req.flash('error', 'Post not found');
      return res.status(404).redirect('/'); // Redirect to home or handle appropriately
    }

    req.flash('success', 'Post successfully updated');
    res.redirect(`/posts/${result._id}`);
  } catch (err) {
    // Handle errors
    console.error(err);
    req.flash('error', 'Internal Server Error');
    res.status(500).redirect('/'); // Redirect to home or handle appropriately
  }
});

// Show login form
app.get('/login', (req, res) => {
  res.render('login', { user: req.user });
});

// Handle login form submission
app.post(
  '/login',
  passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/login',
    failureFlash: true,
  })
);

// Logout route
app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Internal Server Error');
    }
    res.redirect('/login');
  });
});
/////////////comments start -------------------------------------------->>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
app.post('/blogs/:id/comments', isLoggedIn, async (req, res) => {
  try {
    const postId = req.params.id;
    console.log(postId);

    // Check if postId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      console.log('Invalid postId');
      return res.status(400).send('Invalid postId');
    }

    const post = await Post.findById(postId);
    console.log(post);

    if (!post) {
      console.log('Post not found');
      return res.status(404).send('Post not found');
    }

    const newComment = new Comment({
      author: req.user ? req.user.username : 'Anonymous',
      comment: req.body.comment,
    });
    console.log(newComment);
    // Save the post to update the comments array
    await newComment.save();
    /////////////////////////////////////////////////////오 여기서 문제 고침
    // Add the new comment to the post's comments array
    post.comments.push(newComment);

    await post.save();
    console.log('Post After Saving Comment:', post);
    // Redirect to the post detail page
    res.redirect(`/posts/${postId}`);
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

//////////commts end -------------------------------------------->>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

// Delete a comment

// Middleware to check if user is logged in
function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) {
    next();
  } else {
    res.redirect('/login');
  }
}

// Start the server
app.listen(3000, () => {
  console.log('Server is running on port 3000');
});

// Export the User model
export default User;
