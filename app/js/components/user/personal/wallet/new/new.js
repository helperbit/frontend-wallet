helperbitControllers.controller('MeWalletNewCtrl', ['$scope', '$location', '$cookies', '$routeParams', '$rootScope', '$bitcoin', '$api', 'feature', '$window',
	function ($scope, $location, $cookies, $routeParams, $rootScope, $bitcoin, $api, feature, $window) {
		if (!$cookies.get('token')) { $location.path('/login'); }

		$scope.username = $cookies.get('username');

		$api.me.get().then(function (res) {
			$scope.user = res.data;

			if ($scope.user.usertype != 'company' && $scope.user.usertype != 'singleuser')
				$location.path('/me/wallet');

			//TODO check wallet number
		});

		$scope.newwallet = {
			error: '',
			mnemonic: $bitcoin.generateMnemonic(),
			enckey: '',
			enckey2: '',
			visibility: 'password',
			phase: 0,
			file: null,
			download: false,
			loading: false,
			accept: false,
			downloaded: false,
			user: $scope.username,
			segwit: true
		};

		$scope.printSeed = function () {
			var oldtitle = document.title;
			document.title = 'helperbit_passphrase_' + $scope.username + '.pdf';
			$window.print();
			document.title = oldtitle;
		};

		$scope.renewMnemonic = function () {
			$scope.newwallet.mnemonic = $bitcoin.generateMnemonic();
		};

		$scope.newAddressBack = function () {
			if ($scope.newwallet.phase > 0)
				$scope.newwallet.phase -= 1;
		};

		$scope.newAddressNextRepeat = function () {
			for (var i = 0; i < $scope.newwallet.verifymn.length; i++) {
				if ($scope.newwallet.verifymn[i].correct != $scope.newwallet.verifymn[i].insert) {
					$scope.newwallet.error = 'XM1';
					return;
				}
			}

			$scope.newwallet.phase += 1;
		};
		
		$scope.newAddressNext = function () {
			var mn2 = $scope.newwallet.mnemonic.split(' ');
			var el1 = Math.floor(Math.random() * 4);
			var el2 = Math.floor(Math.random() * 4);
			var el3 = Math.floor(Math.random() * 4);
			$scope.newwallet.verifymn = [
				{ index: el1 + 1, correct: mn2[el1], insert: '' },
				{ index: el2 + 5, correct: mn2[4 + el2], insert: '' },
				{ index: el3 + 9, correct: mn2[8 + el3], insert: '' }
			];

			$scope.newwallet.phase += 1;
		};

		$scope.downloadBackup = function () {
			$scope.newwallet.downloaded = true;
		};

		$scope.newAddressDo = function () {
			$scope.newwallet.loading = true;

			// First key, generated from mnemonic
			var key1 = $bitcoin.mnemonicToKeys($scope.newwallet.mnemonic);

			// Second key, randomly created
			var key2 = $bitcoin.randomKeys();

			// Create the wallet
			var createfun = $api.wallet.create;
			if ($scope.newwallet.segwit)
				createfun = $api.wallet.createSegwit;

			createfun([key1.public, key2.public]).then(function (res) {
				// Give the encrypted key as backup file
				var ee = $bitcoin.encryptKeys(key2.private, $scope.newwallet.enckey);
				$scope.newwallet.address = res.data.address;
				$scope.newwallet.file = JSON.stringify({
					user: $scope.username, segwit: $scope.newwallet.segwit, encprivkey: ee, address: res.data.address, pubkey: key2.public,
					pubkeys: [key1.public, key2.public, res.data.pubkeysrv]
				});
				$scope.newwallet.loading = false;
				$scope.newwallet.phase = 3;
				$scope.newwallet.downloaded = false;

				$rootScope.$emit('notificationUpdate', { from: 'wallet' });
			}).catch(function (res) {
				$scope.newwallet.error = res.data.error;
				$scope.newwallet.loading = false;
			});
		};
	}
]);