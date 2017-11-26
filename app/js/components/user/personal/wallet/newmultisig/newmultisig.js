helperbitControllers.controller ('MeWalletNewMultisigCtrl', ['$scope', '$location', '$cookies', '$routeParams', '$rootScope', '$api', 'feature',
	function ($scope, $location, $cookies, $routeParams, $rootScope, $api, feature) {
		if (! $cookies.get ('token')) { $location.path ('/login'); }

		$api.me.get ().then (function (res) {
			$scope.user = res.data;

			if ($scope.user.usertype != 'npo')
				$location.path ('/me/wallet');				
		});

		$scope.newmultisigwallet = {
			error: '',
			phase: 0,
			n: 3,
			label: '',
			admins: [],
			adminscheck: {},
			segwit: true
		};
		
        $api.admin.list ().then(function (res){
			if (res.data.admins.length === 0)
				return $('#noadminModal').modal('show');

			$scope.newmultisigwallet.admins = res.data.admins;
			for (var i = 0; i < res.data.admins.length; i++)
				$scope.newmultisigwallet.adminscheck[res.data.admins[i]] = true;

			$rootScope.$emit ('notificationUpdate', { from: 'wallet' });
		});


		$scope.evaluteMultisigType = function () {
			var m = 1;
			
			for (var ad in $scope.newmultisigwallet.adminscheck)
				if ($scope.newmultisigwallet.adminscheck[ad])
					m ++;

			var n = parseInt ($scope.newmultisigwallet.n);
			return n + ' of ' + m;
		};

		$scope.newMultisigAddressNext = function () {
			var admins = [];

			for (var ad in $scope.newmultisigwallet.adminscheck)
				if ($scope.newmultisigwallet.adminscheck[ad]) admins.push (ad);

			var createfun = $api.wallet.multisig.create;
			if ($scope.newmultisigwallet.segwit)
				createfun = $api.wallet.multisig.createSegwit;

			createfun ($scope.newmultisigwallet.label, $scope.newmultisigwallet.n, admins)
			.then (function (res) {
				$scope.newmultisigwallet.error = '';
				$scope.newmultisigwallet.phase = 1;
				$scope.reloadWallet ();
				$rootScope.$emit ('notificationUpdate', { from: 'wallet' });
			}).catch (function (res){
				$scope.newmultisigwallet.error = res.data.error;
			});
		};
    }
]);