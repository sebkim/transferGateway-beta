const mongoose = require('mongoose');
const { Schema } = mongoose;
const userSchema = new Schema({
  email: String,
  passwordHash: String,
  country: String,
  nick: String,
  email_verified: { type: Boolean, default: false },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  createdAt: Date,
  isTwofactorSet: { type: Boolean, default: false },
  _agreeTerm: { type: Schema.Types.ObjectId, ref: 'agree_terms' },
  favQuestions: { type: [String], default: [] },
  favJudges: { type: [String], default: [] },
  viewQuestions: { type: [String], default: [] },
  // Map {"questionUid": ["analysisUid", ...], ... }
  likeAnalysis: {
    type: Map,
    of: [String],
    default: new Map([])
  },
  // Map {"questionUid": ["analysisUid", ...], ... }
  viewAnalysis: {
    type: Map,
    of: [String],
    default: new Map([])
  },
  profileImgUrl: String,
  isGetPromo: { type: Boolean, default: true },
  isGetNews: { type: Boolean, default: true },
  
  isNotiEmailDeposit: { type: Boolean, default: true },
  isNotiEmailWithdraw: { type: Boolean, default: true },
  isNotiEmailWalCon: { type: Boolean, default: true },
  isNotiEmailPlay: { type: Boolean, default: true },
  isNotiEmailVoting: { type: Boolean, default: true },
  isNotiEmailRepoStart: { type: Boolean, default: true },
  isNotiEmailOpenRepo: { type: Boolean, default: true },
  isNotiEmailRepoClose: { type: Boolean, default: true },
  isNotiEmailChalStart: { type: Boolean, default: true },
  isNotiEmailChalRes: { type: Boolean, default: true },
  isNotiEmailQuesAns: { type: Boolean, default: true },

  isNotiWebDeposit: { type: Boolean, default: true },
  isNotiWebWithdraw: { type: Boolean, default: true },
  isNotiWebWalCon: { type: Boolean, default: true },
  isNotiWebPlay: { type: Boolean, default: false },
  isNotiWebVoting: { type: Boolean, default: false },
  isNotiWebRepoStart: { type: Boolean, default: false },
  isNotiWebOpenRepo: { type: Boolean, default: false },
  isNotiWebRepoClose: { type: Boolean, default: false },
  isNotiWebChalStart: { type: Boolean, default: false },
  isNotiWebChalRes: { type: Boolean, default: false },
  isNotiWebQuesAns: { type: Boolean, default: false },


});

mongoose.model('users', userSchema);