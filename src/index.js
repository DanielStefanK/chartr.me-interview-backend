require('dotenv').config({ path: '.env' });

const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const bodyParser = require('body-parser');
const cors = require('cors');
//var tm = require('text-miner');

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
function countWords(str) {
  return str.trim().split(/\s+/).length;
} //function to count words in a given string
io.on('connection', function(socket) {
  //todo: create data struction manageing all clients at once and serving them the right questions
  let interview;

  console.log('a user connected');

  socket.on('interview_id', async function(id) {
    socket[id] = id;
    console.log('id: ' + socket[id]);
    interview = await db.query.interview(
      { where: { id: socket[id] } },
      '{name company {name} activeUntil deleted results {id} limit interview {question subQuestions {question}}}',
    );
    socket.emit('question', interview.interview[0].question);
  });

  socket.on('disconnect', function() {
    console.log('user disconnected');
  });

  socket.on('credentials', function(msg) {
    console.log('credentials: ' + msg);
  });

  socket.on('message', async function(id, msg) {
    console.log('message: ' + msg);
    socket['questionNumber'] = 0;

    var count = socket['questionNumber'];
    //todo: currently does not count up as intended.

    //console.log(socket['questionNumber']);
    interview = await db.query.interview(
      { where: { id } },
      '{name company {name} activeUntil deleted results {id} limit interview { question subQuestions {question}}}',
    );

    var wordCountQuestion = countWords(interview.interview[count].question);
    var wordCountMsg = countWords(msg);
    var lengthVariable = 1.0;
    var lengthVariableMAX = 6.17938;
    var lengthVariableMIN = 0.53423;
    // could also be defined by the user
    // these numbers for lengthVariableMAX and MIN are not set and should be changed acording to the data we would reseive for a prototype as given in the task we got i will be using the numbers from the paper
    if (wordCountMsg / wordCountQuestion > lengthVariableMAX) {
      console.log('got here');
      lengthVariable =
        0.0 + Math.exp(lengthVariableMAX - wordCountMsg / wordCountQuestion);
    } else if (wordCountMsg / wordCountQuestion < lengthVariableMIN) {
      lengthVariable = 1 - Math.exp(-(wordCountMsg / wordCountQuestion));
    }
    // what happens here is when wordCountMsg / wordCountQuestion is higher then our given MAX we decres the value of given tag matched by an exp funktion vice versa we do it MIN

    //todo: tags, results and tagvalue should be pulled from db

    var tags = ['Word', 'okay'];
    var matchTags = ['Word'];
    var askSubQuestion = false;
    matchTags.forEach(function(tag) {
      if (msg.indexOf(tag) !== -1) {
        askSubQuestion = true;
      }
    });
    //defines if a subquestion needs to be asked
    var result = 0.0;
    var tagvalues = [100, -98];
    var i = 0;

    tags.forEach(function(tag) {
      if (msg.indexOf(tag) !== -1) {
        result += (tagvalues[i] / 100) * lengthVariable;
      }
      i++;
    });
    //adds up the result for a question
    //todo: result needs to be saved up in db
    if (askSubQuestion) {
      socket.emit('question', 'subQuestion');
    } else {
      socket.emit('question', interview.interview[count].question);
      socket['questionNumber'] += 1;
    }
  });
});

app.use((req, res) => {
  res.status(404);
});

http.listen(3000, function() {
  console.log('listening on *:3000');
});
//
