# nodeschoolbot

A github bot that helps out adding members / creating repos for [nodeschool](https://github.com/nodeschool)

```
npm install -g nodeschoolbot
```

[![build status](http://img.shields.io/travis/mafintosh/nodeschoolbot.svg?style=flat)](http://travis-ci.org/mafintosh/nodeschoolbot)

## Usage

```
nodeschoolbot --token={a-github-token} --secret={a-github-webhook-secret}
```

The token passed should have access to create repositories on nodeschool
and to add members to teams.

When setting up the webhook it only needs to forward issue comments

## License

MIT
