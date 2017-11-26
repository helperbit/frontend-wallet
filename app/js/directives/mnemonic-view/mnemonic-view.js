/** Mnemonic visualization */
helperbitApp.directive('mnemonicView', [ function () {
	return {
        restrict: 'E',
        scope: { mnemonic: '=mnemonic' },
        templateUrl: 'js/directives/mnemonic-view/mnemonic-view.html',
		link: function ($scope) {
			$scope.amnemonic = $scope.mnemonic.split (' ');

			$scope.$watch ('mnemonic', function (a) {
				$scope.amnemonic = $scope.mnemonic.split (' ');
			});
		}
	};
}]);