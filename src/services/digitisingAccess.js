const EMAIL='production@ultimatepromotions.co.uk';
const canUseStudio=user=>Boolean(user)&&user.access_scope!=='dtf_only'&&String(user.email||'').trim().toLowerCase()===EMAIL;
function requireStudioUser(req,res,next){
  if(!req.hubUser)return res.status(401).json({error:'Login required'});
  if(!canUseStudio(req.hubUser))return res.status(403).json({error:'Digitising Studio is restricted to the production account.'});
  next();
}
module.exports={canUseStudio,requireStudioUser};
