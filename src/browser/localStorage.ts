// GramJS imports its optional Node store even when StringSession is selected.
// In the browser this must never load node-localstorage's filesystem backend.
export class LocalStorage {
  constructor() { return localStorage; }
}
