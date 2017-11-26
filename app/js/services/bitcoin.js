helperbitApp.service ('$bitcoin', ['config', '$http', function (config, $http) {
    /* Generate a new bip39 valid mnemonic */
    this.generateMnemonic = function () {
        return bip39.generateMnemonic();
    };

    /* Check if the given address is valid */
    this.checkAddress = function (address) {
        try {
            bitcoin.address.toOutputScript (address, config.network);
            return true;
        } catch (e) {
            return false;
        }
    };


    /* Return the keypair from a mnemonic */
    this.mnemonicToKeys = function (secret) {
        var fixSeed = function (seed) {
            return seed
                .replace ('%20', ' ')
                .replace ('  ', ' ')
                .replace ('\n', '')
                .replace ('\r', '')
                .trim ();
        };

		var seed = bip39.mnemonicToSeed (fixSeed (secret));
		var hd = bitcoin.HDNode.fromSeedBuffer (seed, config.network);

		var pair1 = hd.keyPair;
		var priv1 = pair1.toWIF ();
		var pub1 = pair1.getPublicKeyBuffer ().toString ('hex');

        return { private: priv1, public: pub1 };
    };


    /* Random keypair */
    this.randomKeys = function () {
		var pair2 = bitcoin.ECPair.makeRandom({ network: config.network });
		var priv2 = pair2.toWIF ();
		var pub2 = pair2.getPublicKeyBuffer ().toString ('hex');

        return { private: priv2, public: pub2 };
    };


    /* options: {
        seed or wif
        n
        complete
        segwit
        pubkeys
        utxos
    */
    this.sign = function (txhex, options) {
        if ('seed' in options)
            options.wif = this.mnemonicToKeys (options.seed).private;
        if (! ('n' in options))
            options.n = 2;
        if (! ('complete' in options))
            options.complete = true;
        if (! ('segwit' in options))
            options.segwit = false;

        var txb = new bitcoin.TransactionBuilder.fromTransaction (bitcoin.Transaction.fromHex (txhex), config.network);
        var upair = bitcoin.ECPair.fromWIF (options.wif, config.network);
        var pubkeys_raw = options.pubkeys.map (function (hex) { return new buffer.Buffer(hex, 'hex'); });

        if (options.segwit) {            
            var witnessScript = bitcoin.script.multisig.output.encode (options.n, pubkeys_raw);
            var redeemScript = bitcoin.script.witnessScriptHash.output.encode (bitcoin.crypto.sha256(witnessScript));
            var scriptPubKey = bitcoin.script.scriptHash.output.encode (bitcoin.crypto.hash160(redeemScript));
        
            for (var j = 0; j < txb.tx.ins.length; j++)
                txb.sign (j, upair, redeemScript, null, parseInt (options.utxos[j].value * 100000000), witnessScript);
        } else {
            var redeemScript = bitcoin.script.multisig.output.encode (options.n, pubkeys_raw);
        
            for (var j = 0; j < txb.tx.ins.length; j++)
                txb.sign (j, upair, redeemScript);
        }

        if (options.complete)
            return txb.build ().toHex ();
        else
            return txb.buildIncomplete ().toHex ();
    };

    /* Encrypt key */
    this.encryptKeys = function (private, password) {
        var ence = CryptoJS.AES.encrypt(private, password, {iv: password});
	    return ence.toString();
    };

    /* Decrypt key */
    this.decryptKeys = function (encpriv, password) {
        var hex2a = function (hex) {
		    var str = '';
			for (var i = 0; i < hex.length; i += 2)
				str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
			return str;
		};
				
		var privkeye = CryptoJS.AES.decrypt (encpriv, password, {iv: password});
		var privkey = hex2a (privkeye.toString ());
				
		upair = null;
		try {
			upair = bitcoin.ECPair.fromWIF (privkey, config.network);
		} catch (e) {
			return null;
		}			
				
		priv = upair.toWIF ();
		pub = upair.getPublicKeyBuffer ().toString ('hex');	

        return { private: priv, public: pub, pair: upair };
    };
}]);