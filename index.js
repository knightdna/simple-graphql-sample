const express = require('express');
const http = require('http');

const { ApolloServer } = require('apollo-server-express');
const { gql } = require('apollo-server-core');
const { MongoClient } = require('mongodb');
const { PubSub } = require('apollo-server');

const ObjectId = require('mongodb').ObjectID;
const pubSub = new PubSub();

const PORT = 8080;
const mongoDbConfig = {
  url: 'mongodb://localhost:27017/?readPreference=primary&ssl=false',
  dbName: '<replace with your local Mongo database name>'
};

const typeDefs = gql`
  type Profile {
    id: ID!
    pnc: String!
    elc: String!
    cpv: String!
  }

  input ProfileInput {
    pnc: String!
    elc: String!
    cpv: String!
  }
`;

const requests = gql`
  type Query {
    profileById(id: ID!): Profile!
    profileByPnc(pnc: String!): Profile!
  }

  type Mutation {
    profileCreate(profile: ProfileInput): Profile!
    profileDelete(id: ID!): Boolean!
    profileUpdate(id: ID!, profile: ProfileInput): Profile!
  }

  type Subscription {
    profileAdded: Profile,
    profileUpdated: Profile
  }
`;

const PROFILE_ADDED = 'PROFILE_ADDED';
const PROFILE_UPDATED = 'PROFILE_UPDATED';
const resolvers = {
  Query: {
    profileById: (__root, { id }, context) => findProfileById(id, context.db),
    profileByPnc: (__root, { pnc }, context) => findProfileByPnc(pnc, context.db)
  },
  Mutation: {
    profileCreate: (__root, { profile }, context) => createProfile(profile, context.db),
    profileDelete: (__root, { id }, context) => deleteProfile(id, context.db),
    profileUpdate: (__root, { id, profile }, context) => updateProfile(id, profile, context.db),
  },
  Subscription: {
    profileAdded: {
      subscribe: () => pubSub.asyncIterator([PROFILE_ADDED])
    },
    profileUpdated: {
      subscribe: () => pubSub.asyncIterator([PROFILE_UPDATED])
    }
  }
}

const findProfileById = (id, db) => {
  return db.collection('profile')
    .findOne({ '_id': ObjectId(id) })
    .then(response => {
      const [{ pnc, elc, cpv }] = response.ops;
      const profile = {
        id: response._id,
        pnc,
        elc,
        cpv
      }
      return profile;
    })
    .catch(error => {
      console.log('An error occured when finding profile by ID', error);
    });
};

const findProfileByPnc = (pnc, db) => {
  return db.collection('profile')
    .findOne({ pnc })
    .then(response => {
      const profile = {
        id: response._id,
        pnc: response.pnc,
        elc: response.elc,
        cpv: response.cpv
      }
      return profile;
    })
    .catch(error => {
      console.log('An error occured when finding profile by PNC', error);
    });
};

const createProfile = (profile, db) => {
  return db.collection('profile')
    .insertOne(profile)
    .then(response => {
      const [{ pnc, elc, cpv }] = response.ops;
      const createdProfile = {
        id: response.insertedId,
        pnc,
        elc,
        cpv
      };
      pubSub.publish(PROFILE_ADDED, { profileAdded: createdProfile });
      return createdProfile;
    })
    .catch(error => {
      console.log('An error occurred during profile insertion', error);
    });
};

const updateProfile = (id, newProfile, db) => {
  return db.collection('profile')
    .replaceOne({ '_id': ObjectId(id) }, newProfile)
    .then(response => {
      const [{ pnc, elc, cpv }] = response.ops;
      const profile = {
        id: response.upsertedId ? response.upsertedId : id,
        pnc,
        elc,
        cpv
      };
      pubSub.publish(PROFILE_UPDATED, { profileUpdated: profile });
      return profile;
    })
    .catch(error => {
      console.log('An error occurred during profile update', error);
    });
};

const buildAuthenticationContext = (req) => {
  // TODO try to play around and return the authentication context
  // Clue: parse JWT token from request headers to get current user, scopes, etc.
};

const deleteProfile = (id, db) => {
  // TODO try to implement by yourself
  // Clue: use MongoDB's deleteOne
  return true;
};

let db;
const server = new ApolloServer({
  context: async ({ req }) => {
    // const authContext = buildAuthenticationContext(req);
    // TODO pass the authContext and return it together with DB client object

    if (!db) {
      try {
        const options = {
          useNewUrlParser: true,
          useUnifiedTopology: true,
        };
        const dbClient = new MongoClient(mongoDbConfig.url, options);

        if (!dbClient.isConnected()) {
          await dbClient.connect();
        }
        db = dbClient.db(mongoDbConfig.dbName);
      } catch (error) {
        console.log('An error occurred during DB connection establishment', error);
      }
    }
    // We can use anything returned from context here on each resolver
    return { db };
  },
  typeDefs: [typeDefs, requests], 
  resolvers
});

const app = express();
server.applyMiddleware({ app });

const httpServer = http.createServer(app);
server.installSubscriptionHandlers(httpServer);

httpServer.listen(PORT, () => {
  console.log(`Server started on port: ${PORT}`);
});
