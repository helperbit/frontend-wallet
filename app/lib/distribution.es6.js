/**
 * Sostanzialmente ho un `amount` da distribuire tra vari utenti.
 *
 * Posso farlo solo se ci sono degli utenti a cui distribuirlo.
 *
 * Gli utenti a cui poterlo distribuire sono di varie tipologie (singleuser, school, npo... etc)
 * e per ognuna di queste ho una percentuale di redistribuzione  modificabile
 * dall'utente e con un default iniziale (quando l'utente modifica la distribuzione
 * di un gruppo, gli altri devono variare in modo che la somma della distribuzione
 * sia sempre 100%).
 *
 * L'utente ha la possibilita' di mettere un lock alla distribuzione di un gruppo.
 * per non farla variare al variare di quella di altri gruppi. (corner case:
 * se solo un gruppo non e' locked automaticamente non lo fa modificare)
 *
 * La donazione per singolo utente ha un minimo, quindi ho un massimo di benefattori => amount/minDonation
 *
 * Quindi per ogni gruppo, dato un amount da donare, lo divido per la distribution
 * del gruppo e ottenengo l'amount da redistribuire agli utenti di quel gruppo.
 *
 * se questo amount per utente e' minore della donazione minima devo scegliere
 * meno utenti di quelli disponibili, come li scelgo?
 * hanno piu' priorita' nel ricevere gli utenti che hanno ricevuto menu,
 * gli utenti con piu' trustlevel e quelli piu' vicini all'epicentro.
 * a parita' di tutto questo, pesco a caso.
 *
 * l'utente ha la possibilita' di selezionare un trustlevel minimo (per il gruppo singleuser)
 *
 * nel caso in cui non ci siano utenti in un gruppo lo disabilito (anche al cambiare dei parametri
 * dinamici, ad esempio se l'utente cambia il trustlevel minimo alzandolo sopra quello di tutti gli
 * utenti, bisognera' disabilitare il gruppo singleuser e rifare tutta la distribution)
 */
import inside from '@turf/boolean-point-in-polygon'
import disjoint from '@turf/boolean-disjoint'
import combine from '@turf/combine'

class Distribution {
    constructor (affected, amount, trustlevel, config) {
        this.config = config;
        this.affected = affected;
        this.donation = { users: {}};
        this.trustlevel = trustlevel || 100;
        this.amount = parseFloat(amount).toFixed(8);

        this.userTypes = config.userTypes;

        this.distribution = [];
        this.distributionMap = {};

        // inizializzo la distribuzione per ogni tipo di utente
        this.userTypes.forEach( userType => {
            // numero di "utenti" di questo tipo coinvolti
            let localAffectedUsers = affected[userType.code] ? affected[userType.code].length : 0;

            let distribution = {
                userType: userType.code,
                users: [],
                usersMap: {},
                basedistribution: userType.basedistribution,
                // se non ci sono affected user in questo gruppo, disabilito
                enabled: localAffectedUsers > 0 || userType.code  === 'helperbit',
                // come sopra per la distribuzione..
                distribution: localAffectedUsers > 0 || userType.code === 'helperbit' ? userType.basedistribution : 0,
                // nel caso helperbit la distribuzione e' locked
                locked: userType.code === 'helperbit',
                usernumber: 0
            };

            if (localAffectedUsers) {
                distribution.users = affected[userType.code].map( user => {
                    let u = {
                        username: user.username,
                        address: user.address,
                        trustlevel: user.trustlevel,
                        received: user.received,
                        enabled: (userType.code !== 'singleuser' || user.trustlevel >= trustlevel),
                        type: userType.code,
                        donation: 0
                    }
                    distribution.usersMap[user.username] = u;
                    return u
                }).sort(this._sortUsers);
            }

            this.distributionMap[userType.code] = distribution;
            this.distribution.push( distribution );
        })

        // ricalcolo le distribution
        this.update();

        // hb locked di default
        this.distributionMap['helperbit'].locked = true;
    }

    _sortUsers(a, b) {
        // se uno degli utenti e' disabilitato viene dopo
        if (a.enabled && !b.enabled) return -1;
        if (!a.enabled && b.enabled) return 1;

        // ha priorita' chi ha ricevuto di meno
        let deltaReceived = a.received - b.received;

        // se hanno ricevuto la stessa cifra,
        // li ordino per trustlevel (nel caso siano singleuser)
        if (deltaReceived === 0 && a.type === 'singleuser') {
            return a.trustlevel - b.trustlevel;
        } else {
            return deltaReceived;
        }
    }

    _calculateAmountPerType (userType) {
        const groupDistribution = this.distributionMap[userType];
        if (!groupDistribution.enabled || userType === 'helperbit') return;

        // se non c'e' distribution per questo gruppo
        // azzero la distribution per i suoi utenti
        if (groupDistribution.distribution == 0) {
            groupDistribution.users.forEach( user => {
                user.donation = 0;
                // user.enabled = false;
            })
            return;
        }

        // quanto e' l'amount da distribuire tra gli utenti di questo gruppo
        const groupAmount = this.amount / 100 * groupDistribution.distribution;

        // numero di potenziali riceventi
        let nBenefactors = Math.floor(groupAmount / this.config.minDonation);
        if (nBenefactors === 0 && groupAmount > 0) nBenefactors = 1;

        groupDistribution.users.forEach( user => user.donation = 0);

        // seleziono gli utenti abilitati di questo gruppo
        const enabledUsers = groupDistribution.users.filter( user =>  user.enabled );
        enabledUsers.sort(this._sortUsers);

        // se non ci sono utenti abilitati in questo gruppo, lo disabilito e ricalcolo la redistribuzione
        // anche per gli altri gruppi
        if (enabledUsers.length === 0) {
            // groupDistribution.enabled = false;
            if (groupDistribution.distribution !== 0) {
                groupDistribution.distribution = 0;
                groupDistribution.usernumber = 0;
                this.update(userType);
            }
            return;
        }

        // se il numero di potenziali riceventi e' >= del numero degli utenti abilitati..
        // divido in parti uguali
        let amountPerUser = 0;
        if (nBenefactors >= enabledUsers.length) {
            amountPerUser = groupAmount / enabledUsers.length;
            groupDistribution.usernumber = enabledUsers.length;
            enabledUsers.forEach( user => user.donation = amountPerUser.toFixed(8) );
        }
        // altrimenti prendo i primi nBenefactors (sono gia' ordinati per priorita')
        else {
            amountPerUser = groupAmount / nBenefactors;
            groupDistribution.usernumber = nBenefactors;
            enabledUsers.slice(0, nBenefactors).forEach( user => user.donation = amountPerUser.toFixed(8) );
        }

        // groupDistribution.users.forEach( user => {
        //     user.enabled = (user.donation > 0);
        // })

    }

    /**
     * calcolo la distribution per ogni gruppo
     * @param  String keep   un gruppo di cui non modificare la distribution perche' appena cambiato manualmente
     */
    _calculateDistribution(keep) {
        // conto la distribuzione totale in questo momento
        // non considerando i gruppi disabilitati
        let totalDistribution = 0;
        let totalBaseDistribution = 0;
        this.distribution.forEach( userType => {
            if (!userType.enabled) userType.distribution = 0;
            totalDistribution += userType.distribution;
        });

        // se siamo a 100, tutto e' bellissimo e non faccio nulla
        if (totalDistribution === 100) return;


        // gruppi di cui posso modificare la distribution (enabled && !locked)
        let availableUserTypes = this.distribution.filter( userType => {
            const available  = userType.userType != keep && userType.enabled && !userType.locked;
            if (available)
                totalBaseDistribution += userType.basedistribution;
            return available;
        });

        // altrimenti devo redistribuire il rimanente tra gli available
        // proporzionalmente a quanto gia' hanno
        let diff = 100-totalDistribution;

        // se non ci sono available, il keep vince se e' enabled
        if (availableUserTypes.length === 0) {
            if (keep && this.distributionMap[keep].enabled){
                this.distributionMap[keep].distribution += diff;
            }
            else {
                // disabilito la donazione !
                console.error('TODO: DISABLE DONATION! NO AVAILABLE USERS TO DONATE TO.')
            }
            return;
        }

        let redistributed = 0;
        let error = false;
        availableUserTypes.find( userType => {
            if (userType.userType === 'helperbit') return;
            const groupAmount = Math.floor(diff / totalBaseDistribution * userType.basedistribution);
            // diff -= groupAmount;
            if (userType.distribution + groupAmount <= 100 && userType.distribution + groupAmount >= 0) {
                redistributed += groupAmount
                userType.distribution += groupAmount;
            } else {
                error = true;
                return true;
            }
        })

        diff -= redistributed;
        if(error) {
            if (keep && this.distributionMap[keep].enabled)
                this.distributionMap[keep].distribution += diff;
            return;
        }

        if(diff === 0) return;

        // il rimanente lo aggiungo ad un gruppo a caso ma con proporzionalita'
        const dice = Math.floor(Math.random()*totalBaseDistribution);
        let index = 0;
        availableUserTypes.find( userType => {
            index += userType.basedistribution;
            if (dice < index) {
                userType.distribution += diff;
                return true;
            }
        })

    }

    /* Update the distribution; called with default parameters, will return the default distribution */
    update (keep) {
        this._calculateDistribution(keep);
        this.userTypes.forEach( userType => this._calculateAmountPerType(userType.code) );
    }

    /* Update the amount to distribute */
    updateAmount (amount) {
        this.amount = parseFloat(amount).toFixed(8);
        this.userTypes.forEach( userType => this._calculateAmountPerType(userType.code) );
    }

    /* Update the minimum trustlevel for single users */
    updateTrustlevel (level) {
        this.trustlevel = level;
        this.distributionMap['singleuser'].users.forEach( user => {
            user.enabled = (user.trustlevel >= level);
            if (!user.enabled)
                user.donation = 0;
        });
        let enabledUsers = this.distributionMap['singleuser'].users.filter( user => user.enabled );
        if (!enabledUsers.length) {
            this.distributionMap['singleuser'].enabled = false;
            this.distributionMap['singleuser'].distribution = 0;
            this.distributionMap['singleuser'].usernumber = 0;
            this.update('singleuser')
        } else {
            // this.distributionMap['singleuser'].usernumber = enabledUsers.length;
            this._calculateAmountPerType('singleuser');
        }
    }

    /* Modify the lock status of an usertype */
    updateLock (usertype, lockstatus) {
        this.distributionMap[usertype].locked = lockstatus;
    }

    updateUserCheck (usertype, username, checkstatus, checkTrustlevel=false) {
        const user = this.distributionMap[usertype].usersMap[username]
        if (!user) return
        if (checkstatus && checkTrustlevel && usertype === 'singleuser') {
            user.enabled = (usertype != 'singleuser' || user.trustlevel >= this.trustlevel);
        } else {
            user.enabled = checkstatus;
        }

        if (!checkstatus) {
            // se e' false azzero la donazione di questo utente
            this.distributionMap[usertype].usersMap[username].donation = 0;
            // controllo se ci sono altri utenti in questo gruppo altrimenti
            // disabilito il gruppo
            let enabledUsers = this.distributionMap[usertype].users.filter( user => user.enabled )
            if (!enabledUsers.length) {
                this.distributionMap[usertype].enabled = false;
                this.distributionMap[usertype].distribution = 0;
                this.distributionMap[usertype].usernumber = 0;
            }
        } else {
            this.distributionMap[usertype].enabled = true;
        }
    }

    /* Modify the enabler for an usertype */
    updateCheck (usertype, checkstatus) {
        this.distributionMap[usertype].enabled = checkstatus;
        this.distributionMap[usertype].users.forEach( user => {
            if (checkstatus && usertype === 'singleuser') {
                user.enabled = user.trustlevel >= this.trustlevel;
            } else {
                user.enabled = checkstatus;
            }
        });
        if (!checkstatus) {
            this.distributionMap[usertype].users.forEach( user => user.donation = 0);
            this.distributionMap[usertype].distribution = 0;
            this.distributionMap[usertype].usernumber = 0;
        }
    }

    /* Modify the percentage of an usertype */
    updatePercentage (usertype, newvalue) {
        this.distributionMap[usertype].distribution = newvalue;
        // update percentage of other groups
        this.update(usertype);
    }

    updateShakemap (shakemaps, points = null) {

        // single user
        this.affected.geoquads.features.forEach( geoquad => {
            if (!disjoint(geoquad, shakemaps))
                geoquad.properties.idlist.forEach(username => this.updateUserCheck('singleuser', username, true, true));
            else
                geoquad.properties.idlist.forEach(username => this.updateUserCheck('singleuser', username, false, true));
        })

        // others
        // if (!points) {
        //     // TODO
        //     points = { "type": "FeatureCollection", "features": [] };
        //     this.userTypes.forEach ( userType => {
        //         if(userType == 'helperbit' || userType == 'singleuser') return;
        //     })
        //     points.features.push ({ "type": "Feature", "properties": { n: ms[i], t: m.usertype },
        //             "geometry": { "type": "Point", "coordinates": [m.lng, m.lat]}});
        // }

        shakemaps = combine(shakemaps)
        points.features.forEach(f => {
            const i = inside(f,  shakemaps.features[0])
            this.updateUserCheck(f.properties.t, f.properties.n, i, true)
        })

    }

    /* Transform the distribution to an object for donation/create api */
    toFormatted () {
        let formatted = {};

        this.distribution
            .map( userType => userType.users ) // prendo gli users di ogni gruppo
            .reduce( (users, user) => users.concat(user), []) //li concateno in un solo array
            .filter( user => user.donation ) // di cui seleziono solo i destinatari
            .forEach( user => formatted[user.username] = user.donation) // e li metto nei formatted

        formatted['helperbit'] = (this.distributionMap['helperbit'].distribution * this.amount / 100.0).toFixed(8);
        return formatted;
    }

}

// export default Distribution

// if (typeof module !== 'undefined') {
// module.exports = Distribution;
// } else {
window.Distribution = Distribution;
// }