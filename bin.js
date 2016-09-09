#!/usr/bin/env node

var http = require('http')
var request = require('request')
var onjson = require('receive-json')
var minimist = require('minimist')
var crypto = require('crypto')
var after = require('after-all')

var argv = minimist(process.argv, {
  alias: {
    secret: 's',
    token: 't',
    port: 'p'
  }
})

if (!argv.secret) {
  console.error('--secret={webhook-secret} is required')
  process.exit(1)
}

if (!argv.token) {
  console.error('--token={github-token} is required')
  process.exit(1)
}

var CHAPTER_ORGANIZERS = 1660004
var verify = argv.verify !== false

request = request.defaults({
  auth: {
    username: 'x-oauth',
    password: argv.token
  },
  headers: {
    'User-Agent': 'nodeschoolbot'
  }
})

var help = '' +
  'Here is what I can do for you:\n' +
  '\n' +
  '* `help` - shows this help\n' +
  '* `create-repo {name}` - creates a nodeschool repo\n' +
  '* `add-user {username}` - adds a user to the `chapter-organizers` team and the org\n' +
  '* `create-team {team}` - creates a new team\n' +
  '* `add-team-user {team} {username}` - add a user to a specific team\n'

var server = http.createServer(function (req, res) {
  if (req.method === 'GET') {
    res.end('hello, i am the nodeschoolbot\n')
    return
  }

  var hmac = crypto.createHmac('sha1', argv.secret)

  req.setEncoding('utf-8')
  req.on('data', function (data) {
    hmac.update(data, 'utf-8') // gah weird defaults
  })

  onjson(req, function (err, body) {
    if (err) return res.end()
    if (verify && 'sha1=' + hmac.digest('hex') !== req.headers['x-hub-signature']) return res.end()

    var cmds = parseCommand(body.comment && body.comment.body)
    if (!cmds) return res.end()

    var from = body.sender && body.sender.login
    if (from === 'nodeschoolbot') return res.end()

    var added = []
    var repos = []
    var newTeams = []
    var addedteam = {}
    var emptyOk = false

    authenticate(function () {
      var next = after(format)
      cmds.forEach(function (cmd) {
        if (cmd.name === 'barrel-roll') {
          emptyOk = true
          comment(body, '![barrel-roll](https://i.chzbgr.com/maxW500/5816682496/h83DFAE3F/)', next())
          return
        }

        if (cmd.args.length >= 1 && cmd.name === 'create-repo') {
          repos.push(cmd.args[0])
          createRepository(cmd.args[0], next())
          return
        }

        if (cmd.args.length >= 1 && cmd.name === 'add-user') {
          var user = stripAtSign(cmd.args[0])
          added.push(user)
          addUser(user, next())
          return
        }

        if (cmd.args.length >= 1 && cmd.name === 'create-team') {
          var team = stripAtSign(cmd.args[0])
          newTeams.push(team)
          createTeam(team, next())
          return
        }

        if (cmd.args.length >= 1 && cmd.name === 'add-team-user') {
          var team = stripAtSign(cmd.args[0])
          var user = stripAtSign(cmd.args[1])

          if (!addedteam[team]) addedteam[team] = []
          addedteam[team].push(user)
          addTeamUser(team, user, body, next())
          return
        }
      })
    })

    function format (err) {
      if (err) return done(err)

      var msg = ''

      if (repos.length) {
        msg += 'I have created ' + (repos.length === 1 ? 'a' : repos.length) + ' new repo' + (repos.length === 1 ? '' : 's') + ' called '
        repos.forEach(function (repo, i) {
          if (i) msg += ', '
          msg += '[' + repo + '](https://github.com/nodeschool/' + repo + ')'
        })
      }

      if (added.length) {
        if (msg) msg += 'and '
        msg += 'I have added '
        added.forEach(function (user, i) {
          if (i) msg += ', '
          msg += '@' + user
        })
        msg += ' to the `chapter-organizers` team.'
      }

      if (newTeams.length) {
        if (msg) msg += 'and '
        msg += 'I have created '
        newTeams.forEach(function (team, i) {
          if (i) msg += ', '
          msg += '@nodeschool/' + team
        })
        msg += 'team' + (newTeams.length > 1 ? 's' : '')
      }

      if (Object.keys(addedteam).length) {
        for (var team in addedteam) {
          msg += 'I have invited '
          addedteam[team].forEach(function (user, i) {
            if (i) msg += ', '
            msg += '@' + user
          })
          msg += ' to the `' + team + '` team.\n'
        }
      }

      if (emptyOk && !msg) return done()
      comment(body, msg || help, done)
    }

    function authenticate (cb) {
      request.get('https://api.github.com/teams/' + CHAPTER_ORGANIZERS + '/memberships/' + from, {
        json: true
      }, function (err, response) {
        if (err) return done(err)

        if (response.statusCode !== 200 || response.body.state !== 'active') {
          var msg = 'Sorry @' + from + '. You are not allowed to do that if you are not a member of the `chapter-organizers` team'
          comment(body, msg, done)
          return
        }

        cb()
      })
    }

    function done (err) {
      if (err) {
        console.error('Error: ' + err.stack)
        res.statusCode = 500
        res.end()
        comment(body, 'I have encountered an error doing this :(\n\n```\n' + err.stack + '\n```')
        return
      }
      res.end()
    }
  })
})

server.listen(argv.port || process.env.PORT || 8080, function () {
  console.log('nodeschoolbot is now listening for webhooks on %d', server.address().port)
})

function addUser (username, cb) {
  request.put('https://api.github.com/teams/' + CHAPTER_ORGANIZERS + '/memberships/' + username, {
    json: {
      role: 'member'
    }
  }, handleResponse(cb))
}

function createRepository (name, cb) {
  request.post('https://api.github.com/orgs/nodeschool/repos', {
    json: {
      name: name,
      description: 'repo for organizing the ' + name + ' nodeschools',
      homepage: 'https://nodeschool.github.io/' + name,
      private: false,
      has_issues: true,
      has_wiki: false,
      has_downloads: false,
      team_id: CHAPTER_ORGANIZERS,
      auto_init: true
    }
  }, handleResponse(cb))
}

function createTeam (name, cb) {
  request.post('https://api.github.com/orgs/nodeschool/teams', {
    json: {
      name: name,
      privacy: 'closed' // weird naming, actually 'public'
    },
    headers: {
      'Accept': 'application/vnd.github.ironman-preview+json'
    }
  }, handleResponse(cb))
}

function addTeamUser (team, username, body, cb) {
  request.get({
    url: 'https://api.github.com/orgs/nodeschool/teams',
    json: true,
    qs: {
      per_page: Number.MAX_SAFE_INTEGER // otherwise GitHub API will default to 30 results per page
    }
  }, function (e, r, teams) {
    if (e) return cb(e)
    var teamId
    for (var i = 0; i < teams.length; i++) {
      if (teams[i].slug === team) {
        teamId = teams[i].id
        break
      }
    }
    if (!teamId) return comment(body, 'I cannot find the team `' + team + '` ', cb)
    request.put('https://api.github.com/teams/' + teamId + '/memberships/' + username, handleResponse(cb))
  })
}

function comment (body, msg, cb) {
  request.post('https://api.github.com/repos/' + body.repository.full_name + '/issues/' + body.issue.number + '/comments', {
    json: {
      body: msg
    }
  }, handleResponse(cb))
}

function handleResponse (cb) {
  return function (err, res) {
    if (err) return cb(err)
    if (!/2\d\d/.test(res.statusCode)) return cb(new Error('Bad status: ' + res.statusCode))
    cb()
  }
}

function stripAtSign (str) {
  return str[0] === '@' ? str.slice(1) : str
}

function parseCommand (comment) {
  if (!comment) return null
  var line = comment.match(/@nodeschoolbot\s([^\n]*)/g)
  if (!line) return null
  if (/barrel.?roll/.test(comment)) {
    return [{
      name: 'barrel-roll',
      args: []
    }]
  }
  return line.map(function (l) {
    var args = l.trim().split(/\s+/).slice(1)
    return {
      name: args[0] || '',
      args: args.slice(1)
    }
  })
}
