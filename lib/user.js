module.exports = User;

function User(id, name, accessToken, accessTokenSecret) {
  if (!id) throw new Error('id is not specified.');
  if (!name) throw new Error('name is not specified.');
  if (!accessToken) throw new Error('access_token is not specified.');
  if (!accessTokenSecret) throw new Error('access_token_secret is not specified.');

  this.id = id;
  this.name = name;
  this.accessToken = accessToken;
  this.accessTokenSecret = accessTokenSecret;
}
