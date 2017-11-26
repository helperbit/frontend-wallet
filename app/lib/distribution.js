'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

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
var Distribution = function () {
    function Distribution(affected, amount, config) {
        var _this = this;

        _classCallCheck(this, Distribution);

        this.config = config;
        this.affected = affected;
        this.donation = { users: {} };
        this.trustlevel = 0;
        this.amount = parseFloat(amount).toFixed(8);

        this.userTypes = config.userTypes;

        this.distribution = [];
        this.distributionMap = {};

        // inizializzo la distribuzione per ogni tipo di utente
        this.userTypes.forEach(function (userType) {
            // numero di "utenti" di questo tipo coinvolti
            var localAffectedUsers = affected[userType.code] ? affected[userType.code].length : 0;

            var distribution = {
                userType: userType.code,
                users: [],
                usersMap: {},
                basedistribution: userType.basedistribution,
                // se non ci sono affected user in questo gruppo, disabilito
                enabled: localAffectedUsers > 0 || userType.code === 'helperbit',
                // come sopra per la distribuzione..
                distribution: localAffectedUsers > 0 || userType.code === 'helperbit' ? userType.basedistribution : 0,
                // nel caso helperbit la distribuzione e' locked
                locked: userType.code === 'helperbit',
                usernumber: 0
            };

            if (localAffectedUsers) {
                distribution.users = affected[userType.code].map(function (user) {
                    var u = {
                        username: user.username,
                        address: user.address,
                        trustlevel: user.trustlevel,
                        received: user.received,
                        enabled: true,
                        type: userType.code,
                        donation: 0
                    };
                    distribution.usersMap[user.username] = u;
                    return u;
                }).sort(_this._sortUsers);
            }

            _this.distributionMap[userType.code] = distribution;
            _this.distribution.push(distribution);
        });

        // ricalcolo le distribution
        this.update();

        // hb locked di default
        this.distributionMap['helperbit'].locked = true;
    }

    _createClass(Distribution, [{
        key: '_sortUsers',
        value: function _sortUsers(a, b) {
            // se uno degli utenti e' disabilitato viene dopo
            if (a.enabled && !b.enabled) return -1;
            if (!a.enabled && b.enabled) return 1;

            // ha priorita' chi ha ricevuto di meno
            var deltaReceived = a.received - b.received;

            // se hanno ricevuto la stessa cifra,
            // li ordino per trustlevel (nel caso siano singleuser)
            if (deltaReceived === 0 && a.type === 'singleuser') {
                return a.trustlevel - b.trustlevel;
            } else {
                return deltaReceived;
            }
        }
    }, {
        key: '_calculateAmountPerType',
        value: function _calculateAmountPerType(userType) {
            var groupDistribution = this.distributionMap[userType];
            if (!groupDistribution.enabled || userType === 'helperbit') return;

            // se non c'e' distribution per questo gruppo
            // azzero la distribution per i suoi utenti
            if (groupDistribution.distribution == 0) {
                groupDistribution.users.forEach(function (user) {
                    user.donation = 0;
                    // user.enabled = false;
                });
                return;
            }

            // quanto e' l'amount da distribuire tra gli utenti di questo gruppo
            var groupAmount = this.amount / 100 * groupDistribution.distribution;

            // numero di potenziali riceventi
            var nBenefactors = Math.floor(groupAmount / this.config.minDonation);
            if (nBenefactors === 0 && groupAmount > 0) nBenefactors = 1;

            groupDistribution.users.forEach(function (user) {
                return user.donation = 0;
            });

            // seleziono gli utenti abilitati di questo gruppo
            var enabledUsers = groupDistribution.users.filter(function (user) {
                return user.enabled;
            });
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
            var amountPerUser = 0;
            if (nBenefactors >= enabledUsers.length) {
                amountPerUser = groupAmount / enabledUsers.length;
                groupDistribution.usernumber = enabledUsers.length;
                enabledUsers.forEach(function (user) {
                    return user.donation = amountPerUser.toFixed(8);
                });
            }
            // altrimenti prendo i primi nBenefactors (sono gia' ordinati per priorita')
            else {
                    amountPerUser = groupAmount / nBenefactors;
                    groupDistribution.usernumber = nBenefactors;
                    enabledUsers.slice(0, nBenefactors).forEach(function (user) {
                        return user.donation = amountPerUser.toFixed(8);
                    });
                }

            // groupDistribution.users.forEach( user => {
            //     user.enabled = (user.donation > 0);
            // })
        }

        /**
         * calcolo la distribution per ogni gruppo
         * @param  String keep   un gruppo di cui non modificare la distribution perche' appena cambiato manualmente
         */

    }, {
        key: '_calculateDistribution',
        value: function _calculateDistribution(keep) {
            // conto la distribuzione totale in questo momento
            // non considerando i gruppi disabilitati
            var totalDistribution = 0;
            var totalBaseDistribution = 0;
            this.distribution.forEach(function (userType) {
                if (!userType.enabled) userType.distribution = 0;
                totalDistribution += userType.distribution;
            });

            // se siamo a 100, tutto e' bellissimo e non faccio nulla
            if (totalDistribution === 100) return;

            // gruppi di cui posso modificare la distribution (enabled && !locked)
            var availableUserTypes = this.distribution.filter(function (userType) {
                var available = userType.userType != keep && userType.enabled && !userType.locked;
                if (available) totalBaseDistribution += userType.basedistribution;
                return available;
            });

            // altrimenti devo redistribuire il rimanente tra gli available
            // proporzionalmente a quanto gia' hanno
            var diff = 100 - totalDistribution;

            // se non ci sono available, il keep vince
            if (availableUserTypes.length === 0) {
                if (keep) {
                    this.distributionMap[keep].distribution += diff;
                } else {
                    // disabilito la donazione !
                    console.error('TODO: DISABLE DONATION! NO AVAILABLE USERS TO DONATE TO.');
                    return;
                }
            }

            var redistributed = 0;
            var error = false;
            availableUserTypes.find(function (userType) {
                if (userType.userType === 'helperbit') return;
                var groupAmount = Math.floor(diff / totalBaseDistribution * userType.basedistribution);
                // diff -= groupAmount;
                if (userType.distribution + groupAmount <= 100 && userType.distribution + groupAmount >= 0) {
                    redistributed += groupAmount;
                    userType.distribution += groupAmount;
                } else {
                    error = true;
                    return true;
                }
            });

            diff -= redistributed;
            if (error) {
                if (keep) this.distributionMap[keep].distribution += diff;
                return;
            }

            if (diff === 0) return;

            // il rimanente lo aggiungo ad un gruppo a caso ma con proporzionalita'
            var dice = Math.floor(Math.random() * totalBaseDistribution);
            var index = 0;
            availableUserTypes.find(function (userType) {
                index += userType.basedistribution;
                if (dice < index) {
                    userType.distribution += diff;
                    return true;
                }
            });
        }

        /* Update the distribution; called with default parameters, will return the default distribution */

    }, {
        key: 'update',
        value: function update(keep) {
            var _this2 = this;

            this._calculateDistribution(keep);
            this.userTypes.forEach(function (userType) {
                return _this2._calculateAmountPerType(userType.code);
            });
        }

        /* Update the amount to distribute */

    }, {
        key: 'updateAmount',
        value: function updateAmount(amount) {
            var _this3 = this;

            this.amount = amount.toFixed(8);
            this.userTypes.forEach(function (userType) {
                return _this3._calculateAmountPerType(userType.code);
            });
        }

        /* Update the minimum trustlevel for single users */

    }, {
        key: 'updateTrustlevel',
        value: function updateTrustlevel(level) {
            this.distributionMap['singleuser'].users.forEach(function (user) {
                return user.enabled = user.trustlevel >= level;
            });
            this._calculateAmountPerType('singleuser');
        }

        /* Modify the lock status of an usertype */

    }, {
        key: 'updateLock',
        value: function updateLock(usertype, lockstatus) {
            this.distribution[usertype].locked = lockstatus;
        }
    }, {
        key: 'updateUserCheck',
        value: function updateUserCheck(usertype, username, checkstatus) {
            this.distributionMap[usertype].usersMap[username].enabled = checkstatus;
            if (!checkstatus) {
                // se e' false azzero la donazione di questo utente
                this.distributionMap[usertype].usersMap[username].donation = 0;
                // controllo se ci sono altri utenti in questo gruppo altrimenti
                // disabilito il gruppo
                var enabledUsers = this.distributionMap[usertype].users.filter(function (user) {
                    return user.enabled;
                });
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

    }, {
        key: 'updateCheck',
        value: function updateCheck(usertype, checkstatus) {
            this.distributionMap[usertype].enabled = checkstatus;
            this.distributionMap[usertype].users.forEach(function (user) {
                return user.enabled = checkstatus;
            });
            if (!checkstatus) {
                this.distributionMap[usertype].distribution = 0;
                this.distributionMap[usertype].usernumber = 0;
            }
        }

        /* Modify the percentage of an usertype */

    }, {
        key: 'updatePercentage',
        value: function updatePercentage(usertype, newvalue) {
            this.distributionMap[usertype].distribution = newvalue;
            // update percentage of other groups
            this.update(usertype);
        }

        /* Transform the distribution to an object for donation/create api */

    }, {
        key: 'toFormatted',
        value: function toFormatted() {
            var formatted = {};

            this.distribution.map(function (userType) {
                return userType.users;
            }) // prendo gli users di ogni gruppo
            .reduce(function (users, user) {
                return users.concat(user);
            }, []) //li concateno in un solo array
            .filter(function (user) {
                return user.donation;
            }) // di cui seleziono solo i destinatari
            .forEach(function (user) {
                return formatted[user.username] = user.donation;
            }); // e li metto nei formatted

            formatted['helperbit'] = (this.distributionMap['helperbit'].distribution * this.amount / 100.0).toFixed(8);
            return formatted;
        }
    }]);

    return Distribution;
}();

// if (typeof module !== 'undefined') {
// module.exports = Distribution;
// } else {
//     window.Distribution = Distribution;
// }
