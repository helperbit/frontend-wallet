helperbitControllers.controller ('MeWalletFeedMultisigCtrl', ['$scope', '$api', '$location', '$cookies', '$routeParams', '$rootScope', '$bitcoin', '$window',
	function ($scope, $api, $location, $cookies, $routeParams, $rootScope, $bitcoin, $window) {
		if (! $cookies.get ('token')) { $location.path ('/login'); }

		$scope.username = $cookies.get ('username');
		
		$scope.renewMnemonic = function () {
			$scope.newwallet.mnemonic = $bitcoin.generateMnemonic();
		};


		$scope.newwallet = {
			error: '',
			mnemonic: $bitcoin.generateMnemonic(),
			phase: 0,
			loading: false,
			accept: false,
			organization: $routeParams.organization,
			user: $scope.username,
			label: $routeParams.label,
			labelshort: $routeParams.label.replace(/ /g,''),
			enckey: '',
			enckey2: '',
			visibility: 'password',
			file: null,
			download: false,
			downloaded: false,
			invalid: false
		};			
		$scope.wallet = null;

		$scope.printSeed = function () {
			var oldtitle = document.title;
			document.title = 'helperbit_passphrase_' + $scope.username + '_' + $routeParams.organization + '.pdf';
			$window.print ();
			document.title = oldtitle;
		};


		$api.wallet.list ().then (function (res) {
			var valid = false;
			var expired = false;

			for (var i = 0; i < res.data.adminof.length; i++) {
				if (res.data.adminof[i]._id == $routeParams.wallet) {
					valid = true;
					$scope.wallet = res.data.adminof[i];
					if (res.data.adminof[i].multisig.active || res.data.adminof[i].multisig.doneadmins.indexOf ($cookies.get ('email')) != -1) {
						expired = true;
					}
				}
			}

			if (expired || !valid)
				$scope.newwallet.invalid = true;
		});
		
		$scope.newAddressNext = function () {
			var mn2 = $scope.newwallet.mnemonic.split (' ');
			var el1 = Math.floor(Math.random() * 4);
			var el2 = Math.floor(Math.random() * 4);
			var el3 = Math.floor(Math.random() * 4);
			$scope.newwallet.verifymn = [
				{ index: el1 + 1,	correct: mn2[el1], 		insert: '' 	},
				{ index: el2 + 5,	correct: mn2[4 + el2], 	insert: ''	},
				{ index: el3 + 9,	correct: mn2[8 + el3], 	insert: '' 	}
			];

			$scope.newwallet.phase += 1;
		};

		$scope.multisigFeedNext = function () {
			for (var i = 0; i < $scope.newwallet.verifymn.length; i++) {
				if ($scope.newwallet.verifymn[i].correct != $scope.newwallet.verifymn[i].insert) {
					$scope.newwallet.error = 'XM1';
					return;					
				}
			}

			$scope.newwallet.phase += 1;
		};


		$scope.newAddressBack = function () {
			if ($scope.newwallet.phase > 0)
				$scope.newwallet.phase -= 1;
		};


		$scope.downloadBackup = function () {
			$scope.newwallet.downloaded = true;
		};

		$scope.multisigFeedDo = function () {
			$scope.newwallet.loading = true;

			// First key, generated from mnemonic
			var key1 = $bitcoin.mnemonicToKeys ($scope.newwallet.mnemonic);

			// Create the wallet
			$api.wallet.multisig.feed ($routeParams.wallet, key1.public).then (function (res) {
				$scope.newwallet.phase = 3;
				$scope.newwallet.error = '';
				
				$scope.newwallet.wid = $routeParams.wallet;
				
	      		var ee = $bitcoin.encryptKeys (key1.private, $scope.newwallet.enckey);
				$scope.newwallet.address = res.data.address;
				$scope.newwallet.file = JSON.stringify ({ user: $scope.username, segwit: $scope.wallet.segwit, pubkeysrv: res.data.pubkeysrv, encprivkey: ee, pubkey: key1.public, walletid: $scope.newwallet.wid, label: $scope.newwallet.label, organization: $scope.newwallet.organization });
				$scope.newwallet.loading = false;
				$scope.newwallet.phase = 3;
				$scope.newwallet.downloaded = false;

				$rootScope.$emit ('notificationUpdate', { from: 'wallet' });
			}).catch (function (res) {
				$scope.newwallet.phase = 3;
				$scope.newwallet.loading = false;
				$scope.newwallet.error = res.data.error;
			});
		};
    }
]);