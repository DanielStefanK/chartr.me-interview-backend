require('dotenv').config({ path: '.env' });

const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const bodyParser = require('body-parser');
const cors = require('cors');

const db = require('./db');

// TODO: only our frontend
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.get('/api/:id', async function(req, res) {
  const interview = await db.query.interview(
    { where: { id: req.params.id } },
    '{name company {name} activeUntil deleted results {id} limit}',
  );

  if (interview && !interview.deleted) {
    if (new Date(interview.activeUntil) < new Date()) {
      return res.json({
        error: 'Interview is expired',
        interview,
      });
    }

    if (interview.results.length >= interview.limit) {
      return res.json({
        error: 'Interview has reached participants limit',
        interview,
      });
    }

    return res.json({ error: false, interview });
  } else {
    return res.json({
      error: 'Interview was not found',
      interview: null,
    });
  }
});

io.on('connection', function(socket) {
  //todo: create data struction manageing all clients at once and serving them the right questions

  console.log('a user connected');

  socket.on('interview_id', function(id) {
    console.log('id: ' + id);
    socket.emit('question', 'fist question ' + id);
  });

  socket.on('disconnect', function() {
    console.log('user disconnected');
  });

  socket.on('credentials', function(msg) {
    console.log('credentials: ' + msg);
  });

  socket.on('message', function(msg) {
    console.log('message: ' + msg);
    socket.emit('question', msg);
  });
});

app.use((req, res) => {
  res.status(404);
});

http.listen(3000, function() {
  console.log('listening on *:3000');
});
