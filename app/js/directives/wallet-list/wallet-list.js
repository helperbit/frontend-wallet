/** List of wallet of an user */
helperbitApp.directive('walletList', [ '$rootScope', '$api', function ($rootScope, $api) {
	return {
        restrict: 'E',
        scope: {
			receiveaddress: "=receiveaddress",
			receive: 		"=receive",
			select: 		"=select",
			withdraw: 		"=withdraw",
			settings: 		"=settings",
			new: 			"=new",
			deposit: 		"=deposit",
			footer: 		"@footer",
			onlyUsable:		"@?onlyUsable"
		},
        templateUrl: 'js/directives/wallet-list/wallet-list.html',
		link: function ($scope) {
			$scope.wallets = [];
			$scope.adminof = [];
			$scope.selected = null;
			$scope.error = '';

			if ($scope.onlyUsable === undefined)
				$scope.onlyUsable = false;
			else
				$scope.onlyUsable = true;

			if ($scope.footer === undefined)
				$scope.footer = false;

			$scope.reload = function () {
				$api.wallet.list ().then (function (res) {
					$scope.wallets = res.data.wallets;
					$scope.adminof = res.data.adminof;

					if ($scope.onlyUsable) {
						$scope.wallets = $scope.wallets.filter (function (w) {
							if ((w.ismultisig && w.multisig.active) || !w.ismultisig)
								return true;
							else
								return false;
						});
						$scope.adminof = [];
					}

					$scope.$broadcast ('loadedWallets', {wallets: $scope.wallets, adminof: $scope.adminof});
					
					if ($scope.receiveaddress !== undefined)
						$scope.receiveaddress = res.data.receiveaddress;
				}).catch (function (res) {
					$scope.error = res.data.error;	
				});
			};

			$scope.reload ();

			var cleanupReloadWallets = $scope.$on('reloadWallets', function(event) {
				$scope.reload ();
			});

			$scope.$on ('$destroy', cleanupReloadWallets);
		}
	};
}]);